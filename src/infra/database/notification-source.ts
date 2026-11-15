import type { Prisma } from '../../generated/prisma/client';
import type { SourceRef } from '../../notifications/dto';
import type { NotificationContext, NotificationSource } from '../../repositories/notification.repository';
import { digest } from '../../auth/crypto';
import { civilDate } from '../../tasks/dto';
import { schedule } from '../../recurrence/engine';
import { resolveLocal, localStamp } from '../../events/time';
type Tx = Prisma.TransactionClient;
export async function lockNotificationSource(tx: Tx, owner: string, ref: SourceRef) {
  // Parameterized queries, no timestamp mutation: preserve the domain's validity stamp.
  const rows = ref.sourceType === 'TASK'
    ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM tasks WHERE id=${ref.sourceId}::uuid AND owner_id=${owner}::uuid FOR UPDATE`
    : ref.sourceType === 'EVENT'
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM events WHERE id=${ref.sourceId}::uuid AND owner_id=${owner}::uuid FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM publications WHERE id=${ref.sourceId}::uuid AND owner_id=${owner}::uuid FOR UPDATE`;
  return rows.length > 0;
}
export async function notificationSource(tx: Tx, owner: string, ref: SourceRef, preferences: NotificationContext['preferences'], date?: string): Promise<NotificationSource | null> {
  if (!await lockNotificationSource(tx, owner, ref)) return null;
  const version = (...parts: unknown[]) => digest(JSON.stringify([ref.sourceType, ref.sourceId, preferences.timezone, ...parts]));
  if (ref.sourceType === 'TASK') {
    const row = await tx.task.findFirst({ where: { id: ref.sourceId, ownerId: owner }, select: { dueDate: true, status: true, archivedAt: true, updatedAt: true,
      recurrenceRules: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!row || row.archivedAt || row.status === 'CANCELLED') return null;
    const rule = row.recurrenceRules[0];
    if (rule) {
      if (!date || rule.state !== 'ACTIVE') return null;
      if (!schedule({ ...rule, startDate: rule.startDate.toISOString().slice(0,10), endDate: rule.endDate?.toISOString().slice(0,10) ?? null }).includes(date)) return null;
      const occurrence = await tx.taskOccurrence.findUnique({ where: { ruleId_date: { ruleId: rule.id, date: civilDate(date)! } } });
      if (occurrence?.completedAt) return null;
      const at = resolveLocal(date + 'T09:00:00.000', rule.timezone);
      return at ? { at, timezone: rule.timezone, version: version(row.updatedAt, rule.updatedAt, occurrence?.updatedAt), recurrenceRuleId: rule.id, recurrenceVersion: rule.version, occurrenceDate: civilDate(date) } : null;
    }
    if (date || row.status === 'COMPLETED' || !row.dueDate) return null;
    const at = resolveLocal(row.dueDate.toISOString().slice(0,10) + 'T09:00:00.000', preferences.timezone);
    return at ? { at, timezone: preferences.timezone, version: version(row.updatedAt), recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null } : null;
  }
  if (ref.sourceType === 'EVENT') {
    const row = await tx.event.findFirst({ where: { id: ref.sourceId, ownerId: owner }, select: { startAt: true, timezone: true, archivedAt: true, updatedAt: true, recurrenceRules: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!row || row.archivedAt) return null;
    const rule = row.recurrenceRules[0];
    if (rule) {
      if (!date || rule.state !== 'ACTIVE' || !schedule({ ...rule, startDate: rule.startDate.toISOString().slice(0,10), endDate: rule.endDate?.toISOString().slice(0,10) ?? null }).includes(date)) return null;
      const exception = await tx.eventException.findUnique({ where: { ruleId_date: { ruleId: rule.id, date: civilDate(date)! } } });
      if (exception?.cancelled) return null;
      // Reuse the civil engine and the event clock resolver; only the reminder's start is needed.
      const baseAt = resolveLocal(date + localStamp(rule.anchorStartAt, rule.timezone).slice(10), rule.timezone);
      // A clock skipped by DST is not an occurrence, even if an out-of-band override exists.
      if (!baseAt) return null;
      const at = exception?.startAt ?? baseAt;
      return at ? { at, timezone: rule.timezone, version: version(row.updatedAt, rule.updatedAt, exception?.updatedAt), recurrenceRuleId: rule.id, recurrenceVersion: rule.version, occurrenceDate: civilDate(date) } : null;
    }
    return date ? null : { at: row.startAt, timezone: row.timezone, version: version(row.updatedAt), recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null };
  }
  const row = await tx.publication.findFirst({ where: { id: ref.sourceId, ownerId: owner }, select: { scheduledAt: true, status: true, archivedAt: true, updatedAt: true } });
  if (!row || date || !row.scheduledAt || row.archivedAt || row.status === 'CANCELLED' || row.status === 'PUBLISHED') return null;
  return { at: row.scheduledAt, timezone: preferences.timezone, version: version(row.updatedAt), recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null };
}
