import { HttpError } from '../errors/http-error';
import { localToday } from '../tasks/dto';
import { schedule, validateRule } from '../recurrence/engine';
import { createRuleDto, ruleResponse, type RuleInput, type RulePatch, type RuleRecord, type OccurrenceQuery, type RecurrenceSnapshot } from '../recurrence/dto';
import type { RecurrenceRepository } from '../repositories/recurrence.repository';
const conflict = (message: string) => new HttpError(409, 'RECURRENCE_CONFLICT', message);
function current(snapshot: RecurrenceSnapshot) {
  if (!snapshot.current) throw new HttpError(404, 'NOT_FOUND', 'Recurrence not found');
  return snapshot.current;
}
function editable(snapshot: RecurrenceSnapshot) { if (snapshot.archived) throw conflict('Restore the task before modifying recurrence'); }
export class RecurrenceService {
  constructor(private readonly repository: RecurrenceRepository, private readonly now = () => new Date()) {}
  async get(ownerId: string, taskId: string) {
    const snapshot = await this.repository.read(ownerId, taskId); const rule = current(snapshot);
    const today = localToday(this.now(), rule.timezone);
    const completed = new Set(snapshot.occurrences.filter((o) => o.ruleId === rule.id && o.completedAt).map((o) => o.date));
    const next = !snapshot.archived && rule.state === 'ACTIVE' ? schedule(rule).find((date) => date >= today && !completed.has(date)) ?? null : null;
    return { ...ruleResponse(rule), nextOccurrenceDate: next, taskArchived: snapshot.archived };
  }
  configure(ownerId: string, taskId: string, input: RuleInput) {
    validateRule(input);
    return this.repository.mutate(ownerId, taskId, (snapshot) => {
      editable(snapshot); if (snapshot.current) throw conflict('Recurrence already configured; use PATCH');
      const now = this.now(); const rule: RuleRecord = { ...input, id: crypto.randomUUID(), taskId, version: 1, state: 'ACTIVE', createdAt: now, updatedAt: now };
      return { change: { rule }, result: ruleResponse(rule) };
    });
  }
  update(ownerId: string, taskId: string, patch: RulePatch) {
    return this.repository.mutate(ownerId, taskId, (snapshot) => {
      editable(snapshot); const previous = current(snapshot);
      if (previous.state === 'ENDED') throw conflict('Ended recurrence cannot be edited');
      const parsed = createRuleDto.safeParse({ frequency: previous.frequency, interval: previous.interval, startDate: previous.startDate,
        weekdays: previous.weekdays, endDate: previous.endDate, count: previous.count, timezone: previous.timezone, ...patch });
      if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid recurrence rule');
      validateRule(parsed.data); const now = this.now();
      const rule: RuleRecord = { ...parsed.data, id: crypto.randomUUID(), taskId, version: previous.version + 1, state: previous.state, createdAt: now, updatedAt: now };
      return { change: { rule }, result: ruleResponse(rule) };
    });
  }
  transition(ownerId: string, taskId: string, action: 'suspend' | 'resume' | 'end') {
    return this.repository.mutate(ownerId, taskId, (snapshot) => {
      editable(snapshot); const rule = current(snapshot);
      if (rule.state === 'ENDED' && action !== 'end') throw conflict('Ended recurrence cannot resume');
      const state = action === 'suspend' ? 'PAUSED' : action === 'resume' ? 'ACTIVE' : 'ENDED';
      const next = { ...rule, state, updatedAt: this.now() } as RuleRecord;
      return { change: { rule: next }, result: ruleResponse(next) };
    });
  }
  async occurrences(ownerId: string, taskId: string, query: OccurrenceQuery) {
    const snapshot = await this.repository.read(ownerId, taskId, query.ruleId);
    const rule = query.ruleId ? snapshot.rules.find((r) => r.id === query.ruleId) : current(snapshot);
    if (!rule) throw new HttpError(404, 'NOT_FOUND', 'Recurrence not found');
    const saved = snapshot.occurrences.filter((o) => o.ruleId === rule.id);
    const calculated = snapshot.current?.id === rule.id && rule.state === 'ACTIVE' && !snapshot.archived;
    const dates = calculated ? schedule(rule) : saved.map((o) => o.date).sort();
    const filtered = dates.filter((date) => date >= query.from && date <= query.to && (!query.after || date > query.after));
    const items = filtered.slice(0, query.limit).map((date) => ({ ruleId: rule.id, date, completedAt: saved.find((o) => o.date === date)?.completedAt?.toISOString() ?? null }));
    return { items, page: { limit: query.limit, nextAfter: filtered.length > query.limit ? items.at(-1)!.date : null }, calculated };
  }
  setCompleted(ownerId: string, taskId: string, ruleId: string, date: string, completed: boolean) {
    return this.repository.mutate(ownerId, taskId, (snapshot) => {
      editable(snapshot); const rule = current(snapshot);
      if (!snapshot.rules.some((r) => r.id === ruleId)) throw new HttpError(404, 'NOT_FOUND', 'Recurrence not found');
      if (rule.id !== ruleId || rule.state !== 'ACTIVE') throw conflict('Only current active recurrence can change occurrence state');
      if (!schedule(rule).includes(date)) throw new HttpError(404, 'NOT_FOUND', 'Occurrence not found');
      const previous = snapshot.occurrences.find((o) => o.ruleId === rule.id && o.date === date);
      const at = this.now(); const occurrence = { ruleId, date, completedAt: completed ? previous?.completedAt ?? at : null, updatedAt: at };
      const changed = Boolean(previous?.completedAt) !== completed;
      return { change: { occurrence, ...(changed ? { event: { ruleId, date, completed, at } } : {}) },
        result: { ruleId, date, completedAt: occurrence.completedAt?.toISOString() ?? null } };
    });
  }
}
export interface RecurrenceDependencies { run<T>(operation: (service: RecurrenceService) => Promise<T>): Promise<T>; }
