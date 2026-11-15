import { z } from 'zod';
import { digest } from '../auth/crypto';
import { civilDate, localToday } from '../tasks/dto';
import { resolveLocal } from '../events/time';
import { HttpError } from '../errors/http-error';
import { reminderRuleDto, reminderIntentDto, digestIntentDto, leaseDto, failureCategoryDto, notificationQueryDto,
  type OutboxRecord, type IntentData, type NotificationStatus, type FailureCategory } from '../notifications/dto';
import type { NotificationRepository, NotificationContext, NotificationChange } from '../repositories/notification.repository';
const conflict = (message: string) => new HttpError(409, 'NOTIFICATION_CONFLICT', message);
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const result = schema.safeParse(input); if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid notification input'); return result.data; };
const live = (state: NotificationStatus) => ['PENDING','RESERVED','PUBLISHED'].includes(state);
const digestVersion = ({ preferences: p }: NotificationContext) => digest(JSON.stringify([p.timezone,p.emailEnabled,p.dailyDigestEnabled,p.dailyDigestTime]));
const clearLease = { leaseToken: null, leaseUntil: null, reservedFrom: null };
export class NotificationService {
  constructor(private readonly repository: NotificationRepository, private readonly now = () => new Date(), private readonly uuid = () => crypto.randomUUID()) {}
  async configure(owner: string, input: unknown) { return this.repository.configure(owner, parse(reminderRuleDto, input)); }
  private scheduled(at: Date) {
    const delta = at.getTime() - this.now().getTime();
    if (!Number.isFinite(delta) || delta < 0 || delta > 30 * 86400000) throw conflict('Scheduling window is now through 30 days; no backfill');
  }
  async createReminder(owner: string, input: unknown) {
    const reminder = parse(reminderIntentDto, input);
    return this.repository.enqueue(owner, reminder, (context) => {
      const { rule, source, preferences } = context;
      if (!rule?.enabled || !source || !preferences.emailEnabled) throw conflict('Reminder is disabled or source is unavailable');
      const scheduledAt = new Date(source.at.getTime() - rule.leadMinutes * 60000);
      const data: IntentData = { type: `${rule.sourceType}_REMINDER`, sourceType: rule.sourceType, sourceId: rule.sourceId,
        reminderRuleId: rule.id, ruleVersion: rule.version, sourceVersion: source.version,
        recurrenceRuleId: source.recurrenceRuleId, recurrenceVersion: source.recurrenceVersion, occurrenceDate: source.occurrenceDate,
        digestDate: null, timezone: source.timezone, scheduledAt, idempotencyKey: '' };
      data.idempotencyKey = digest(JSON.stringify([owner, data.type, rule.id, rule.version, source.version, source.recurrenceRuleId, source.recurrenceVersion, source.occurrenceDate, scheduledAt]));
      return data;
    }, (data) => this.scheduled(data.scheduledAt));
  }
  async createDigest(owner: string, input: unknown) {
    const { date } = parse(digestIntentDto, input);
    return this.repository.enqueue(owner, null, (context) => {
      const p = context.preferences;
      if (!p.emailEnabled || !p.dailyDigestEnabled) throw conflict('Daily digest is disabled');
      const scheduledAt = resolveLocal(date + 'T' + p.dailyDigestTime + ':00.000', p.timezone);
      if (!scheduledAt) throw conflict('Local digest time does not exist; no automatic shift');
      return { type: 'DAILY_DIGEST', sourceType: null, sourceId: null, reminderRuleId: null, ruleVersion: null,
        sourceVersion: digestVersion(context), recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null, digestDate: civilDate(date),
        timezone: p.timezone, scheduledAt, idempotencyKey: digest(JSON.stringify([owner, 'DAILY_DIGEST', date])) };
    }, (data) => this.scheduled(data.scheduledAt));
  }
  private valid(row: OutboxRecord, context: NotificationContext) {
    if (!context.preferences.emailEnabled) return false;
    if (row.type === 'DAILY_DIGEST') return context.preferences.dailyDigestEnabled && row.sourceVersion === digestVersion(context) && row.digestDate !== null && localToday(this.now(), context.preferences.timezone) <= row.digestDate.toISOString().slice(0,10);
    return context.rule?.enabled && row.ruleVersion === context.rule.version && context.source !== null
      && context.source.at >= this.now() && row.sourceVersion === context.source.version && row.recurrenceRuleId === context.source.recurrenceRuleId
      && row.recurrenceVersion === context.source.recurrenceVersion;
  }
  private cancelled(error: FailureCategory = 'STALE'): NotificationChange {
    return { patch: { status: 'CANCELLED', cancelledAt: this.now(), lastError: error, ...clearLease }, result: 'CANCELLED', at: this.now(), error };
  }
  async invalidate(owner: string, id: string) {
    return this.repository.mutate(owner, parse(z.uuid(), id), (row, context) => live(row.status) && !this.valid(row, context) ? this.cancelled() : null);
  }
  async cancel(owner: string, id: string) {
    return this.repository.mutate(owner, parse(z.uuid(), id), (row) => live(row.status) ? this.cancelled('USER_CANCELLED') : null);
  }
  async reserve(owner: string, id: string, input: unknown = {}) {
    const { seconds } = parse(leaseDto, input);
    return this.repository.mutate(owner, parse(z.uuid(), id), (row, context) => {
      if (!['PENDING','PUBLISHED'].includes(row.status)) throw conflict('No automatic retry or lease reclaim');
      if (!this.valid(row, context)) return this.cancelled();
      const now = this.now(); if (row.scheduledAt > now) throw conflict('Intention is not due');
      return { patch: { status: 'RESERVED', reservedFrom: row.status, leaseToken: this.uuid(), leaseUntil: new Date(now.getTime() + seconds * 1000), attemptCount: row.attemptCount + 1 }, result: 'RESERVED', at: now };
    });
  }
  private lease(row: OutboxRecord, token: string) {
    if (row.status !== 'RESERVED' || row.leaseToken !== token || !row.leaseUntil || row.leaseUntil <= this.now()) throw conflict('Invalid or expired lease');
  }
  async published(owner: string, id: string, token: string) {
    parse(z.uuid(), token);
    return this.repository.mutate(owner, parse(z.uuid(), id), (row, context) => {
      this.lease(row, token); if (row.reservedFrom !== 'PENDING') throw conflict('Not a publication reservation');
      if (!this.valid(row, context)) return this.cancelled();
      return { patch: { status: 'PUBLISHED', publishedAt: this.now(), ...clearLease }, result: 'QUEUED', at: this.now() };
    });
  }
  async accepted(owner: string, id: string, input: unknown) {
    const { leaseToken, providerMessageId } = parse(z.object({ leaseToken: z.uuid(), providerMessageId: z.string().trim().min(1).max(200) }).strict(), input);
    return this.repository.mutate(owner, parse(z.uuid(), id), (row) => {
      this.lease(row, leaseToken); if (row.reservedFrom !== 'PUBLISHED') throw conflict('Not a delivery reservation');
      // Caller must have observed provider acceptance. Do not replace this fact with a late cancellation.
      return { patch: { status: 'SENT', sentAt: this.now(), providerMessageId, ...clearLease }, result: 'PROVIDER_ACCEPTED', at: this.now() };
    });
  }
  async fail(owner: string, id: string, input: unknown) {
    const { leaseToken, category } = parse(z.object({ leaseToken: z.uuid(), category: failureCategoryDto.exclude(['STALE','USER_CANCELLED','LEASE_EXPIRED']) }).strict(), input);
    return this.repository.mutate(owner, parse(z.uuid(), id), (row) => {
      this.lease(row, leaseToken);
      return { patch: { status: 'FAILED', failedAt: this.now(), lastError: category, ...clearLease }, result: 'FAILED', at: this.now(), error: category };
    });
  }
  async expire(owner: string, id: string) {
    return this.repository.mutate(owner, parse(z.uuid(), id), (row) => {
      if (row.status !== 'RESERVED' || !row.leaseUntil || row.leaseUntil > this.now()) throw conflict('Lease is not expired');
      return { patch: { status: 'FAILED', failedAt: this.now(), lastError: 'LEASE_EXPIRED', ...clearLease }, result: 'FAILED', at: this.now(), error: 'LEASE_EXPIRED' };
    });
  }
  async get(owner: string, id: string) { const row = await this.repository.get(owner, parse(z.uuid(), id)); if (!row) throw new HttpError(404, 'NOT_FOUND', 'Notification resource not found'); return row; }
  async list(owner: string, input: unknown = {}) {
    const query = parse(notificationQueryDto, input), rows = await this.repository.list(owner, query);
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore: rows.length > query.limit } };
  }
  async history(owner: string, id: string, input: unknown = {}) {
    const query = parse(notificationQueryDto, input), rows = await this.repository.history(owner, parse(z.uuid(), id), query);
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore: rows.length > query.limit } };
  }
}
