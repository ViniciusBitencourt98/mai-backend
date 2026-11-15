import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../../src/services/notification.service';
import { NotificationProcessor, notificationMessageDto, notificationSettings } from '../../src/notifications/processing';
import { createNotificationJobRepository } from '../../src/infra/database/notification-job-persistence';
import type { NotificationRepository, NotificationContext } from '../../src/repositories/notification.repository';
import type { OutboxRecord } from '../../src/notifications/dto';
import type { PrismaClient } from '../../src/generated/prisma/client';

function fixture() {
  let clock = new Date('2026-11-15T08:00:00Z');
  const ownerId = randomUUID(), ruleId = randomUUID();
  const context: NotificationContext = { preferences: { timezone: 'UTC', emailEnabled: true, dailyDigestEnabled: false, dailyDigestTime: '08:00' },
    rule: { id: ruleId, ownerId, sourceType: 'TASK', sourceId: randomUUID(), version: 1, enabled: true, leadMinutes: 60, createdAt: clock, updatedAt: clock },
    source: { at: new Date('2026-11-15T09:00:00Z'), version: 'a'.repeat(64), timezone: 'UTC', recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null } };
  const rows = new Map<string, OutboxRecord>(), changes: unknown[] = [];
  function add(patch: Partial<OutboxRecord> = {}) {
    const row: OutboxRecord = { id: randomUUID(), ownerId, type: 'TASK_REMINDER', sourceType: 'TASK', sourceId: context.rule!.sourceId,
      reminderRuleId: ruleId, ruleVersion: 1, sourceVersion: 'a'.repeat(64), recurrenceRuleId: null, recurrenceVersion: null,
      occurrenceDate: null, digestDate: null, timezone: 'UTC', scheduledAt: clock, idempotencyKey: 'b'.repeat(64), status: 'PENDING',
      leaseToken: null, leaseUntil: null, reservedFrom: null, attemptCount: 0, publishedAt: null, sentAt: null, failedAt: null,
      cancelledAt: null, lastError: null, providerMessageId: null, createdAt: clock, updatedAt: clock, ...patch };
    rows.set(row.id, row); return row;
  }
  // Serialized transactions with snapshots only in tests. Not evidence of PostgreSQL locking.
  let chain = Promise.resolve();
  const mutate = vi.fn<NotificationRepository['mutate']>((owner, id, operation) => {
    const result = chain.then(() => {
      const row = rows.get(id)!;
      if (row.ownerId !== owner) throw new Error('Wrong persisted owner');
      const change = operation(structuredClone(row), structuredClone(context));
      if (change) { changes.push(change); Object.assign(row, change.patch); }
      return structuredClone(row);
    });
    chain = result.then(() => {}, () => {}); return result;
  });
  const repository = { mutate } as unknown as NotificationRepository;
  const service = new NotificationService(repository, () => clock);
  const jobs = {
    due: vi.fn(async (now: Date, limit: number) => [...rows.values()].filter(r => r.scheduledAt <= now && (r.status === 'PENDING'
      || (r.status === 'RESERVED' && r.reservedFrom === 'PENDING' && r.leaseUntil! <= now))).sort((a,b) => a.scheduledAt.getTime()-b.scheduledAt.getTime() || a.id.localeCompare(b.id)).slice(0, limit)),
    locate: vi.fn(async (id: string) => rows.get(id) ?? null),
  };
  const logger = vi.fn(), send = vi.fn().mockResolvedValue(undefined);
  const processor = new NotificationProcessor(jobs, service, logger, () => clock);
  const dispatch = () => processor.dispatch({ send }, { limit: 2, seconds: 60 });
  const message = (body: unknown) => ({ body, ack: vi.fn(), retry: vi.fn() });
  const consume = async (body: unknown) => { const msg = message(body); await processor.consume(msg); return msg; };
  return { rows, context, add, service, processor, jobs, logger, send, dispatch, consume, mutate, changes,
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}
const payload = (row: OutboxRecord) => ({ version: 1, outboxId: row.id });

it('selects due intentions including boundary, excludes future/terminal and limits the batch', async () => {
  const f = fixture(), first = f.add({ scheduledAt: new Date('2026-11-15T07:00Z') }), second = f.add();
  f.add({ scheduledAt: new Date('2026-11-15T08:00:00.001Z') }); f.add({ status: 'CANCELLED' }); f.add({ status: 'SENT' }); f.add();
  await f.dispatch(); expect(f.send).toHaveBeenCalledTimes(2);
  expect(f.send.mock.calls.map(c => c[0].outboxId)).toEqual(expect.arrayContaining([first.id]));
  expect([...f.rows.values()].filter(r => r.status === 'PUBLISHED')).toHaveLength(2);
  expect(second.sentAt).toBeNull();
});
it('publishes minimal JSON and distinguishes queue acceptance from SENT', async () => {
  const f = fixture(), row = f.add(); await f.dispatch();
  expect(f.send).toHaveBeenCalledWith(payload(row), { contentType: 'json' });
  expect(row).toMatchObject({ status: 'PUBLISHED', leaseToken: null, publishedAt: expect.any(Date), sentAt: null, attemptCount: 1 });
  expect(f.changes).toEqual([expect.objectContaining({ result: 'RESERVED' }), expect.objectContaining({ result: 'QUEUED' })]);
});
it('allows only one publisher under simulated dispatcher contention', async () => {
  const f = fixture(); f.add(); await Promise.all([f.dispatch(), f.dispatch()]);
  expect(f.send).toHaveBeenCalledTimes(1);
});
it('recovers an expired publication lease atomically with a fresh token, not an active lease', async () => {
  const f = fixture(), row = f.add(), original = await f.service.reserveDispatch(row.ownerId, row.id, 1);
  expect(await f.service.reserveDispatch(row.ownerId, row.id)).toBeNull();
  f.advance(1000); const recovered = await f.service.reserveDispatch(row.ownerId, row.id);
  expect(recovered?.leaseToken).not.toBe(original?.leaseToken); expect(recovered?.attemptCount).toBe(2);
  await expect(f.service.published(row.ownerId, row.id, original!.leaseToken!)).rejects.toMatchObject({ status: 409 });
});
it('never recovers delivery leases or terminal states', async () => {
  const f = fixture();
  for (const status of ['PUBLISHED', 'SENT', 'FAILED', 'CANCELLED', 'RESERVED'] as const) {
    const row = f.add({ status, reservedFrom: status === 'RESERVED' ? 'PUBLISHED' : null, leaseToken: randomUUID(), leaseUntil: new Date(0), publishedAt: new Date(0) });
    expect(await f.service.reserveDispatch(row.ownerId, row.id)).toBeNull();
  }
  await f.dispatch(); expect(f.send).not.toHaveBeenCalled();
});
it('keeps failed/ambiguous publication leased and retries only after expiry', async () => {
  const f = fixture(), row = f.add(); f.send.mockRejectedValueOnce(new Error('secret URL'));
  await f.dispatch(); expect(row.status).toBe('RESERVED'); expect(f.logger).toHaveBeenCalledWith('PUBLICATION_FAILED', row.id);
  await f.dispatch(); expect(f.send).toHaveBeenCalledTimes(1);
  f.advance(60000); await f.dispatch(); expect(f.send).toHaveBeenCalledTimes(2); expect(row.status).toBe('PUBLISHED'); expect(row.sentAt).toBeNull();
});
it('recovers publication accepted before confirmation failed and tolerates duplicate messages', async () => {
  const f = fixture(), row = f.add();
  const published = vi.spyOn(f.service, 'published').mockRejectedValueOnce(new Error('connection secret'));
  await f.dispatch(); expect(row.status).toBe('RESERVED');
  const early = await f.consume(payload(row)); expect(early.retry).toHaveBeenCalledWith({ delaySeconds: 60 }); expect(early.ack).not.toHaveBeenCalled();
  f.advance(60000); await f.dispatch(); expect(published).toHaveBeenCalledTimes(2); expect(f.send).toHaveBeenCalledTimes(2);
  const before = f.changes.length;
  const messages = await Promise.all([f.consume(payload(row)), f.consume(payload(row))]);
  messages.forEach(m => { expect(m.ack).toHaveBeenCalledOnce(); expect(m.retry).not.toHaveBeenCalled(); });
  expect(f.changes).toHaveLength(before); expect(row).toMatchObject({ status: 'PUBLISHED', sentAt: null, providerMessageId: null });
});
it.each(['disabled', 'rule version', 'source version', 'missing source', 'past source'])('cancels %s before publication', async reason => {
  const f = fixture(), row = f.add();
  if (reason === 'disabled') f.context.preferences.emailEnabled = false;
  if (reason === 'rule version') f.context.rule!.version++;
  if (reason === 'source version') f.context.source!.version = 'c'.repeat(64);
  if (reason === 'missing source') f.context.source = null;
  if (reason === 'past source') f.advance(3600001);
  await f.dispatch(); expect(row.status).toBe('CANCELLED'); expect(f.send).not.toHaveBeenCalled();
});
it.each([null, 'secret', {}, { version: 2, outboxId: randomUUID() }, { version: 1, outboxId: 'bad' }, { version: 1, outboxId: randomUUID(), ownerId: randomUUID() }])('acks malformed message %# without DB access or leaking body', async body => {
  const f = fixture(), msg = await f.consume(body); expect(msg.ack).toHaveBeenCalledOnce(); expect(f.jobs.locate).not.toHaveBeenCalled();
  expect(f.logger.mock.calls).toEqual([['INVALID_MESSAGE']]);
});
it('acks missing and terminal messages without writes', async () => {
  const f = fixture(); expect((await f.consume({ version: 1, outboxId: randomUUID() })).ack).toHaveBeenCalledOnce();
  for (const status of ['SENT', 'FAILED', 'CANCELLED', 'PENDING'] as const) {
    const row = f.add({ status }); const msg = await f.consume(payload(row));
    expect(msg.ack).toHaveBeenCalledOnce(); expect(msg.retry).not.toHaveBeenCalled(); expect(row.status).toBe(status);
  }
  expect(f.changes).toHaveLength(0);
});
it('checks persisted ownership and current validity again at consumption', async () => {
  const f = fixture(), row = f.add(); await f.dispatch(); f.context.preferences.emailEnabled = false;
  const msg = await f.consume(payload(row)); expect(msg.ack).toHaveBeenCalledOnce();
  expect(row).toMatchObject({ status: 'CANCELLED', sentAt: null });
  expect(f.mutate).toHaveBeenLastCalledWith(row.ownerId, row.id, expect.any(Function));
});
it('does not reserve delivery or fabricate provider success with no adapter', async () => {
  const f = fixture(), row = f.add(); await f.dispatch();
  const before = structuredClone(row); const msg = await f.consume(payload(row));
  expect(row).toEqual(before); expect(msg.ack).toHaveBeenCalledOnce(); expect(f.logger).toHaveBeenLastCalledWith('PROVIDER_NOT_CONFIGURED', row.id);
});
it('retries infrastructure failures before any provider and sanitizes logs', async () => {
  const f = fixture(), row = f.add(); f.jobs.locate.mockRejectedValueOnce(new Error('postgres://secret'));
  const msg = await f.consume(payload(row)); expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 }); expect(msg.ack).not.toHaveBeenCalled();
  f.jobs.due.mockRejectedValueOnce(new Error('postgres://secret')); await expect(f.dispatch()).rejects.toThrow('Notification discovery failed');
  f.mutate.mockRejectedValueOnce(new Error('postgres://secret')); await expect(f.dispatch()).rejects.toThrow('Notification reservation failed');
  expect(JSON.stringify(f.logger.mock.calls)).not.toContain('secret'); expect(row.status).toBe('PENDING');
});
it('does not acknowledge a failed persistence preflight as success', async () => {
  const f = fixture(), row = f.add({ status: 'PUBLISHED' }); f.mutate.mockRejectedValueOnce(new Error('write failed'));
  const msg = await f.consume(payload(row)); expect(msg.retry).toHaveBeenCalledOnce(); expect(msg.ack).not.toHaveBeenCalled();
});
it('validates bounds and queue schema', () => {
  expect(notificationSettings({})).toEqual({ limit: 20, seconds: 60 });
  for (const config of [{ NOTIFICATION_BATCH_SIZE: '101' }, { NOTIFICATION_LEASE_SECONDS: '301' }, { NOTIFICATION_BATCH_SIZE: '0' }, { NOTIFICATION_LEASE_SECONDS: '1.5' }]) expect(() => notificationSettings(config)).toThrow();
  expect(notificationMessageDto.parse({ version: 1, outboxId: randomUUID() })).toHaveProperty('version', 1);
});
describe('Prisma discovery predicates (isolated client, not Neon)', () => {
  it('bounds/order due candidates and selects expired publication leases only, excluding disabled owners', async () => {
    const findMany = vi.fn().mockResolvedValue([]), findUnique = vi.fn().mockResolvedValue(null);
    const jobs = createNotificationJobRepository({ notificationOutbox: { findMany, findUnique } } as unknown as PrismaClient);
    const now = new Date(); await jobs.due(now, 20);
    expect(findMany).toHaveBeenCalledWith({ where: { scheduledAt: { lte: now }, owner: { disabledAt: null }, OR: [
      { status: 'PENDING' }, { status: 'RESERVED', reservedFrom: 'PENDING', leaseUntil: { lte: now } },
    ] }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: 20, select: { id: true, ownerId: true } });
    const id = randomUUID(); await jobs.locate(id); expect(findUnique).toHaveBeenCalledWith({ where: { id }, select: { id: true, ownerId: true } });
    for (const limit of [0, 101, 1.5]) await expect(jobs.due(now, limit)).rejects.toThrow();
  });
});
