import type { PrismaClient, Prisma } from '../../generated/prisma/client';
import type { RecurrenceRepository } from '../../repositories/recurrence.repository';
import type { RecurrenceSnapshot, RuleRecord } from '../../recurrence/dto';
import { HttpError } from '../../errors/http-error';
import { civilDate } from '../../tasks/dto';
type Client = Prisma.TransactionClient;
export function createRecurrenceRepository(client: PrismaClient): RecurrenceRepository {
  async function snapshot(tx: Client, ownerId: string, taskId: string, ruleId?: string): Promise<RecurrenceSnapshot> {
    const task = await tx.task.findFirst({ where: { id: taskId, ownerId }, select: { archivedAt: true } });
    if (!task) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
    const rows = await tx.taskRecurrence.findMany({ where: { taskId }, orderBy: { version: 'desc' }, take: 101 });
    if (rows.length > 100) throw new HttpError(409, 'RECURRENCE_LIMIT', 'Maximum 100 rule versions');
    const selected = ruleId ?? rows[0]?.id;
    const states = selected ? await tx.taskOccurrence.findMany({ where: { ruleId: selected, rule: { taskId } }, take: 10001 }) : [];
    if (states.length > 10000) throw new HttpError(409, 'RECURRENCE_LIMIT', 'Occurrence history limit');
    const rules: RuleRecord[] = rows.map((row) => ({ ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate?.toISOString().slice(0, 10) ?? null }));
    return { archived: task.archivedAt !== null, current: rules[0] ?? null, rules,
      occurrences: states.map((row) => ({ ...row, date: row.date.toISOString().slice(0, 10) })) };
  }
  return {
    // Repeatable read keeps the current version and state overlay from one snapshot.
    read(ownerId, taskId, ruleId) { return client.$transaction((tx) => snapshot(tx, ownerId, taskId, ruleId), { isolationLevel: 'RepeatableRead' }); },
    mutate(ownerId, taskId, operation) {
      return client.$transaction(async (tx) => {
        const locked = await tx.task.updateMany({ where: { id: taskId, ownerId }, data: { updatedAt: new Date() } });
        if (!locked.count) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
        const before = await snapshot(tx, ownerId, taskId);
        const { change, result } = operation(before);
        if (change.rule) {
          const { id, taskId: _taskId, ...rule } = change.rule;
          void _taskId;
          const data = { ...rule, startDate: civilDate(rule.startDate)!, endDate: civilDate(rule.endDate) };
          if (before.rules.some((r) => r.id === id)) await tx.taskRecurrence.update({ where: { id }, data });
          else {
            if (before.rules.length >= 100) throw new HttpError(409, 'RECURRENCE_LIMIT', 'Maximum 100 rule versions');
            await tx.taskRecurrence.create({ data: { ...data, id, taskId } });
          }
        }
        if (change.occurrence) {
          const { ruleId, date, completedAt, updatedAt } = change.occurrence;
          const key = { ruleId, date: civilDate(date)! };
          await tx.taskOccurrence.upsert({ where: { ruleId_date: key }, create: { ...key, completedAt, updatedAt }, update: { completedAt, updatedAt } });
        }
        if (change.event) await tx.taskOccurrenceEvent.create({ data: { ruleId: change.event.ruleId, date: civilDate(change.event.date)!, completed: change.event.completed, createdAt: change.event.at } });
        return result;
      }, { timeout: 15000, maxWait: 10000 });
    },
  };
}
