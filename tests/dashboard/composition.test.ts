import { expect, it, vi } from 'vitest';
import { calendarQueryDto, type CalendarMaster, type CalendarRepository } from '../../src/calendar/dto';
import { type EventSnapshot } from '../../src/events/dto';
import { HttpError } from '../../src/errors/http-error';
import { createRuleDto, type RecurrenceSnapshot, type RuleRecord } from '../../src/recurrence/dto';
import type { EventRepository } from '../../src/repositories/event.repository';
import type { RecurrenceRepository } from '../../src/repositories/recurrence.repository';
import { CalendarService } from '../../src/services/calendar.service';
import { EventService } from '../../src/services/event.service';
import { RecurrenceService } from '../../src/services/recurrence.service';

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
    publications: async () => [],
    tasks: vi.fn(async (owner) => owner === 'A' ? [master(taskId, 'Task', task.current!, task.occurrences.map((o) => o.date))] : []),
    events: vi.fn(async (owner) => owner === 'A' ? [master(eventId, event.event.title, event.rules[0]!, event.exceptions.map((o) => o.date))] : []),
  };
  const service = new CalendarService(repository, { run: (fn) => fn(recurrence) }, { run: (fn) => fn(events) });
  return { task, event, taskRead, eventRead, mutation, repository, service };
}


import { DashboardService } from '../../src/services/dashboard.service';
import { dashboardQueryDto } from '../../src/dashboard/dto';
it('dashboard reuses real recurrence/event engines, including completion, cancelled and moved exceptions without writes', async () => {
  const app = fixture();
  app.event.exceptions.push({ ...app.event.exceptions[0]!, date: '2026-03-01', title: 'Moved into today', startAt: new Date('2026-03-02T12:00:00Z'), endAt: new Date('2026-03-02T13:00:00Z') });
  const service = new DashboardService({ pendingTasks: async () => 1 }, { run: fn => fn(app.service) }, () => at);
  const result = await service.get('A', dashboardQueryDto.parse({date:'2026-03-02'}), 'UTC');
  expect(result.overdueTasks.items.map(i=>i.occurrenceDate)).toEqual(['2026-03-01']);
  expect(result.today.items.find(i=>i.type==='TASK')).toMatchObject({completed:true,occurrenceDate:'2026-03-02'});
  expect(result.upcomingTasks.items.map(i=>i.occurrenceDate)).toEqual(['2026-03-03','2026-03-04']);
  expect(result.today.items.some(i=>i.title==='Moved into today')).toBe(true);
  expect([...result.today.items,...result.upcomingEvents.items].some(i=>i.title==='Cancelled')).toBe(false);
  expect(result.upcomingEvents.items.some(i=>i.occurrenceDate==='2026-03-03')).toBe(true);
  expect(result.today.items.filter(i=>i.type==='TASK').every(i=>i.ruleId===taskRuleId && i.id!==taskId)).toBe(true);
  expect(app.mutation).not.toHaveBeenCalled();
});
it('calendar HTTP pagination still slices the same single collected aggregate', async () => {
  const app=fixture(), q=query();const collected=await app.service.collect('A',q,'UTC');const listed=await app.service.list('A',{...q,limit:1},'UTC');
  expect(listed.items).toEqual(collected.items.slice(0,1));expect(listed.page.hasMore).toBe(collected.items.length>1);
});
