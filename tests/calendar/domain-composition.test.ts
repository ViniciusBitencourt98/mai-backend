import { describe, expect, it, vi } from 'vitest';
import { calendarQueryDto, type CalendarMaster, type CalendarRepository } from '../../src/calendar/dto';
import { type EventSnapshot } from '../../src/events/dto';
import { HttpError } from '../../src/errors/http-error';
import { createRuleDto, type RecurrenceSnapshot, type RuleRecord } from '../../src/recurrence/dto';
import type { EventRepository } from '../../src/repositories/event.repository';
import type { RecurrenceRepository } from '../../src/repositories/recurrence.repository';
import { CalendarService } from '../../src/services/calendar.service';
import { EventService } from '../../src/services/event.service';
import { RecurrenceService } from '../../src/services/recurrence.service';
import { localToday } from '../../src/tasks/dto';

const at = new Date('2026-03-01T12:00:00Z');
const taskId = '00000000-0000-4000-8000-000000000001';
const taskRuleId = '00000000-0000-4000-8000-000000000002';
const eventId = '00000000-0000-4000-8000-000000000003';
const eventRuleId = '00000000-0000-4000-8000-000000000004';
const query = (extra = {}) => calendarQueryDto.parse({ from: '2026-03-01T00:00:00Z', to: '2026-03-04T00:00:00Z', ...extra });

/** Only persistence is isolated: calendar calls the actual domain services/engines. */
function fixture() {
  const rule: RuleRecord = {
    ...createRuleDto.parse({ frequency: 'DAILY', startDate: '2026-03-01', count: 4, timezone: 'UTC' }),
    id: taskRuleId, taskId, version: 1, state: 'ACTIVE', createdAt: at, updatedAt: at,
  };
  const task: RecurrenceSnapshot = { archived: false, current: rule, rules: [rule], occurrences: [
    { ruleId: taskRuleId, date: '2026-03-02', completedAt: at, updatedAt: at },
  ] };
  const { taskId: _taskId, ...eventRule } = rule;
  void _taskId;
  const event: EventSnapshot = {
    event: { id: eventId, ownerId: 'A', title: 'Interview', description: null, location: null, projectId: null,
      startAt: new Date('2026-02-28T23:30:00Z'), endAt: new Date('2026-03-01T00:30:00Z'), timezone: 'UTC',
      archivedAt: null, createdAt: at, updatedAt: at },
    rules: [{ ...eventRule, id: eventRuleId, eventId, startDate: '2026-02-28',
      anchorStartAt: new Date('2026-02-28T23:30:00Z'), anchorEndAt: new Date('2026-03-01T00:30:00Z') }],
    exceptions: [
      { ruleId: eventRuleId, date: '2026-02-28', title: 'Moved interview', description: null, location: null,
        startAt: new Date('2026-03-01T00:15:00Z'), endAt: new Date('2026-03-01T01:15:00Z'), cancelled: false, updatedAt: at },
      { ruleId: eventRuleId, date: '2026-03-02', title: 'Cancelled', description: null, location: null,
        startAt: new Date('2026-03-02T23:30:00Z'), endAt: new Date('2026-03-03T00:30:00Z'), cancelled: true, updatedAt: at },
    ],
  };
  function owned(owner: string, id: string, expected: string) {
    if (owner !== 'A' || id !== expected) throw new HttpError(404, 'NOT_FOUND', 'Not found');
  }
  const taskRead = vi.fn(async (owner: string, id: string) => { owned(owner, id, taskId); return structuredClone(task); });
  const eventRead = vi.fn(async (owner: string, id: string) => { owned(owner, id, eventId); return structuredClone(event); });
  // Mutation is deliberately unavailable: a calendar read must never persist an occurrence.
  const mutation = vi.fn(async (): Promise<never> => { throw new Error('Unexpected persistence'); });
  const recurrence = new RecurrenceService({ read: taskRead, mutate: mutation } satisfies RecurrenceRepository, () => at);
  const events = new EventService({ read: eventRead, mutate: mutation } as unknown as EventRepository, () => at);
  const master = (id: string, title: string, activeRule: RuleRecord | EventSnapshot['rules'][number], dates: string[]): CalendarMaster => ({
    id, title, timezone: activeRule.timezone, date: null, startAt: null, endAt: null, completed: false,
    rule: { id: activeRule.id, version: activeRule.version, timezone: activeRule.timezone, modifiedDates: dates },
  });
  const repository: CalendarRepository = {
    tasks: vi.fn(async (owner) => owner === 'A' ? [master(taskId, 'Task', task.current!, task.occurrences.map((o) => o.date))] : []),
    events: vi.fn(async (owner) => owner === 'A' ? [master(eventId, event.event.title, event.rules[0]!, event.exceptions.map((o) => o.date))] : []),
  };
  const service = new CalendarService(repository, { run: (fn) => fn(recurrence) }, { run: (fn) => fn(events) });
  return { task, event, taskRead, eventRead, mutation, repository, service };
}

describe('Phase 3 calendar composition — isolated repositories, real domain engines', () => {
  it('merges completion, moved exceptions and overlaps, excluding cancellation without persisting reads', async () => {
    const app = fixture();
    const result = await app.service.list('A', query(), 'UTC');
    const tasks = result.items.filter((item) => item.type === 'TASK');
    expect(tasks.map((item) => item.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(tasks.map((item) => item.completed)).toEqual([false, true, false]);
    const events = result.items.filter((item) => item.type === 'EVENT');
    expect(events.map((item) => item.occurrenceDate)).toEqual(['2026-02-28', '2026-03-01', '2026-03-03']);
    expect(events[0]).toMatchObject({ id: eventRuleId + ':2026-02-28', masterId: eventId,
      title: 'Moved interview', modified: true, startAt: '2026-03-01T00:15:00.000Z' });
    expect(new Set(result.items.map((item) => item.type + ':' + item.id)).size).toBe(result.items.length);
    expect(app.mutation).not.toHaveBeenCalled();
  });

  it.each(['PAUSED', 'ENDED'] as const)('shows only saved states/exceptions of %s series', async (state) => {
    const app = fixture();
    app.task.current!.state = state;
    app.event.rules[0]!.state = state;
    const result = await app.service.list('A', query(), 'UTC');
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.type === 'TASK')).toMatchObject({ occurrenceDate: '2026-03-02', completed: true });
    expect(result.items.find((item) => item.type === 'EVENT')).toMatchObject({ occurrenceDate: '2026-02-28', title: 'Moved interview' });
  });

  it('selects the latest version and does not mix saved state from older rules', async () => {
    const app = fixture();
    const next = { ...app.task.current!, id: '00000000-0000-4000-8000-000000000005', version: 2, interval: 2 };
    app.task.current = next;
    app.task.rules.unshift(next);
    const result = await app.service.list('A', query({ types: 'TASK' }), 'UTC');
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.ruleId === next.id && item.version === 2 && item.type === 'TASK' && !item.completed)).toBe(true);
    expect(app.taskRead).toHaveBeenCalledWith('A', taskId, next.id);
    expect(app.eventRead).not.toHaveBeenCalled();
  });

  it('keeps timezone, stable identity and local start through the DST boundary', async () => {
    const app = fixture();
    app.event.exceptions = [];
    Object.assign(app.event.rules[0]!, { startDate: '2026-03-07', count: 3, timezone: 'America/New_York',
      anchorStartAt: new Date('2026-03-07T14:00:00Z'), anchorEndAt: new Date('2026-03-07T15:00:00Z') });
    const result = await app.service.list('A', query({ types: 'EVENT', from: '2026-03-07T00:00:00Z', to: '2026-03-10T00:00:00Z' }), 'Pacific/Auckland');
    expect(result.items.map((item) => item.type === 'EVENT' && item.startAt)).toEqual([
      '2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z',
    ]);
    expect(result.items.every((item) => item.timezone === 'America/New_York' && item.id === eventRuleId + ':' + item.occurrenceDate)).toBe(true);
  });

  it('keeps ownership at the aggregate boundary and passes it into both domains', async () => {
    const app = fixture();
    expect((await app.service.list('B', query(), 'UTC')).items).toEqual([]);
    expect(app.taskRead).not.toHaveBeenCalled();
    expect(app.eventRead).not.toHaveBeenCalled();
    await app.service.list('A', query(), 'UTC');
    expect(app.taskRead).toHaveBeenCalledWith('A', taskId, taskRuleId);
    expect(app.eventRead).toHaveBeenCalledWith('A', eventId, eventRuleId);
  });

  it('paginates the combined result deterministically and returns an empty later window', async () => {
    const app = fixture();
    const all = await app.service.list('A', query(), 'UTC');
    const first = await app.service.list('A', query({ limit: '2' }), 'UTC');
    const second = await app.service.list('A', query({ limit: '2', page: '2' }), 'UTC');
    expect([...first.items, ...second.items]).toEqual(all.items.slice(0, 4));
    expect(first.page.hasMore).toBe(true);
    expect((await app.service.list('A', query({ from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' }), 'UTC')).items).toEqual([]);
  });
});

it.each(['0001', '0099', '0999', '2026'])('preserves four-digit civil years (%s) accepted by recurrence and calendar DTOs', (year) => {
  expect(localToday(new Date(year + '-03-01T00:30:00Z'), 'UTC')).toBe(year + '-03-01');
  expect(localToday(new Date(year + '-03-01T23:30:00Z'), 'Asia/Tokyo')).toBe(year + '-03-02');
});
