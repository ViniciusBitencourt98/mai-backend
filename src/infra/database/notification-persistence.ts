import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { NotificationRepository, NotificationContext } from '../../repositories/notification.repository';
import { preferenceDefaults } from '../../preferences/dto';
import { HttpError } from '../../errors/http-error';
import { notificationSource, lockNotificationSource } from './notification-source';
import type { ReminderIntent } from '../../notifications/dto';
const missing = () => new HttpError(404, 'NOT_FOUND', 'Notification resource not found');
const live = ['PENDING', 'RESERVED', 'PUBLISHED'] as const;
type Tx = Prisma.TransactionClient;
type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
function repository(run: Run, read: Tx): NotificationRepository {
  async function context(tx: Tx, ownerId: string, reminder: ReminderIntent | null): Promise<NotificationContext> {
    // Serializes operations for this owner, including concurrent preferences/disable writes.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id=${ownerId}::uuid AND disabled_at IS NULL FOR UPDATE`;
    if (!locked.length) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
    const preferences = await tx.userPreferences.findUnique({ where: { userId: ownerId }, select: { timezone: true, emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: true } }) ?? preferenceDefaults;
    const rule = reminder ? await tx.reminderRule.findFirst({ where: { id: reminder.reminderRuleId, ownerId } }) : null;
    const source = rule ? await notificationSource(tx, ownerId, rule, preferences, reminder?.occurrenceDate) : null;
    return { preferences, rule, source };
  }
  return {
    configure(ownerId, input) {
      return run(async (tx) => {
        await context(tx, ownerId, null);
        if (!await lockNotificationSource(tx, ownerId, input)) throw missing();
        const where = { ownerId_sourceType_sourceId: { ownerId, sourceType: input.sourceType, sourceId: input.sourceId } };
        const previous = await tx.reminderRule.findUnique({ where });
        if (previous && previous.leadMinutes === input.leadMinutes && previous.enabled === input.enabled) return previous;
        const active = previous ? await tx.notificationOutbox.count({ where: { ownerId, reminderRuleId: previous.id, status: { in: [...live] } } }) : 0;
        if (active > 100) throw new HttpError(409, 'NOTIFICATION_LIMIT', 'Rule cancellation batch exceeds 100');
        const rule = await tx.reminderRule.upsert({ where, create: { ...input, ownerId }, update: { leadMinutes: input.leadMinutes, enabled: input.enabled, version: { increment: 1 } } });
        // Creation caps active rows per rule at 100, so this audit batch is bounded.
        const rows = await tx.notificationOutbox.updateManyAndReturn({ where: { ownerId, reminderRuleId: rule.id, status: { in: [...live] } },
          data: { status: 'CANCELLED', cancelledAt: new Date(), leaseToken: null, leaseUntil: null, reservedFrom: null, lastError: 'STALE' } });
        if (rows.length) await tx.notificationDeliveryLog.createMany({ data: rows.map((row) => ({ ownerId, outboxId: row.id, status: 'CANCELLED' as const, result: 'CANCELLED' as const, errorCategory: 'STALE' as const })) });
        return rule;
      });
    },
    enqueue(ownerId, reminder, build, validateNew) {
      return run(async (tx) => {
        const current = await context(tx, ownerId, reminder);
        if (reminder && !current.rule) throw missing();
        const data = build(current);
        const existing = await tx.notificationOutbox.findUnique({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: data.idempotencyKey } } });
        if (existing) return existing;
        validateNew(data);
        const count = await tx.notificationOutbox.count({ where: { ownerId, status: { in: [...live] } } });
        const perRule = data.reminderRuleId ? await tx.notificationOutbox.count({ where: { ownerId, reminderRuleId: data.reminderRuleId, status: { in: [...live] } } }) : 0;
        if (count >= 1000 || perRule >= 100) throw new HttpError(409, 'NOTIFICATION_LIMIT', 'Active intention limit');
        const row = await tx.notificationOutbox.create({ data: { ...data, ownerId } });
        await tx.notificationDeliveryLog.create({ data: { ownerId, outboxId: row.id, status: 'PENDING', result: 'CREATED' } });
        return row;
      });
    },
    mutate(ownerId, id, operation) {
      return run(async (tx) => {
        const initial = await context(tx, ownerId, null);
        const row = await tx.notificationOutbox.findFirst({ where: { id, ownerId } });
        if (!row) throw missing();
        const current = row.reminderRuleId ? await context(tx, ownerId, { reminderRuleId: row.reminderRuleId,
          ...(row.occurrenceDate ? { occurrenceDate: row.occurrenceDate.toISOString().slice(0,10) } : {}) }) : initial;
        const change = operation(row, current);
        if (!change) return row;
        const rows = await tx.notificationOutbox.updateManyAndReturn({ where: { id, ownerId, status: row.status, leaseToken: row.leaseToken }, data: change.patch });
        if (!rows[0]) throw new HttpError(409, 'NOTIFICATION_CONFLICT', 'Notification state changed');
        await tx.notificationDeliveryLog.create({ data: { ownerId, outboxId: id, status: rows[0].status, attemptedAt: change.at, result: change.result,
          errorCategory: change.error ?? null, providerMessageId: rows[0].providerMessageId } });
        return rows[0];
      });
    },
    get(ownerId, id) { return read.notificationOutbox.findFirst({ where: { id, ownerId } }); },
    list(ownerId, query) { return read.notificationOutbox.findMany({ where: { ownerId, ...(query.status ? { status: query.status } : {}) }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit + 1 }); },
    async history(ownerId, id, query) {
      if (!await read.notificationOutbox.findFirst({ where: { id, ownerId }, select: { id: true } })) throw missing();
      return read.notificationDeliveryLog.findMany({ where: { ownerId, outboxId: id, ...(query.status ? { status: query.status } : {}) }, orderBy: [{ attemptedAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit + 1 });
    },
  };
}
export function createNotificationRepository(client: PrismaClient): NotificationRepository {
  return repository((fn) => client.$transaction(fn, { timeout: 15000, maxWait: 10000 }), client);
}
/** Future domain hooks can share the caller's transaction; no nested transaction or separate commit. */
export function createNotificationTransactionRepository(tx: Tx): NotificationRepository { return repository((fn) => fn(tx), tx); }
