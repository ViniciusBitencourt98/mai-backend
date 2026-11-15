import { HttpError } from '../../errors/http-error';
import { jobLogger } from '../../notifications/processing';
import type { PrismaClient } from '../../generated/prisma/client';
import { lockReminderOwner, synchronizeReminders } from './domain-reminders';
/** Persistent keyset traversal: every committed step renews one rule and advances
 * its cursor atomically. No timestamps/versions of user rules are modified. */
export async function renewReminders(client: PrismaClient, now = new Date(), limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid renewal batch size');
  const visited = new Set<string>();
  for (let index = 0; index < limit; index++) {
    const progressed = await client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO notification_maintenance_cursors(name) VALUES ('reminders') ON CONFLICT DO NOTHING`;
      const cursors = await tx.$queryRaw<{last_rule_id:string|null}[]>`SELECT last_rule_id FROM notification_maintenance_cursors WHERE name='reminders' FOR UPDATE`;
      const cursor = cursors[0]?.last_rule_id ?? null;
      const select = (after: string | null) => tx.reminderRule.findMany({where:{enabled:true,owner:{disabledAt:null},...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:1});
      let rules = await select(cursor);
      if (!rules.length && cursor) rules = await select(null);
      const rule = rules[0];
      if (!rule || visited.has(rule.id)) return false;
      visited.add(rule.id);
      // Same ordering as domain hooks; cursor is used only by maintenance jobs.
      await lockReminderOwner(tx,rule.ownerId);
      await tx.$executeRaw`SAVEPOINT reminder_renewal`;
      try { await synchronizeReminders(tx,rule.ownerId,rule,now); }
      catch (error) {
        if (!(error instanceof HttpError) || error.code !== 'NOTIFICATION_LIMIT') throw error;
        // Undo every partial invalidation/insert before skipping an over-budget rule.
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT reminder_renewal`;
        jobLogger('RENEWAL_LIMIT',rule.id);
      }
      await tx.$executeRaw`RELEASE SAVEPOINT reminder_renewal`;
      await tx.$executeRaw`UPDATE notification_maintenance_cursors SET last_rule_id=${rule.id}::uuid WHERE name='reminders'`;
      return true;
    },{timeout:30000,maxWait:10000});
    if (!progressed) break;
  }
}
