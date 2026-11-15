import type { PrismaClient } from '../../generated/prisma/client';
import type { NotificationService } from '../../services/notification.service';
import { localToday } from '../../tasks/dto';
import { resolveLocal } from '../../events/time';
import { HttpError } from '../../errors/http-error';
/** Bounded anti-join excludes already planned days, so the first users cannot starve later users. */
export async function planDigests(client: PrismaClient, service: NotificationService, now = new Date()) {
  const users = await client.$queryRaw<{id:string;timezone:string;time:string}[]>`
    SELECT u.id,p.timezone,p.daily_digest_time AS time FROM users u
    JOIN user_preferences p ON p.user_id=u.id
    WHERE u.disabled_at IS NULL AND p.email_enabled AND p.daily_digest_enabled
    AND to_char(${now}::timestamptz AT TIME ZONE p.timezone,'HH24:MI') >= p.daily_digest_time
    AND NOT EXISTS (SELECT 1 FROM notification_outbox o WHERE o.owner_id=u.id
      AND o.type='DAILY_DIGEST' AND o.digest_date=(${now}::timestamptz AT TIME ZONE p.timezone)::date)
    ORDER BY u.id LIMIT 100`;
  for (const user of users) {
    const date = localToday(now,user.timezone), at = resolveLocal(date+'T'+user.time+':00.000',user.timezone);
    if (!at || at > now) continue; // Gap is skipped, fold uses existing first-instant policy.
    try { await service.createDigest(user.id,{date},true); }
    catch (error) { if (error instanceof HttpError && [401,409].includes(error.status)) continue; throw error; }
  }
}
