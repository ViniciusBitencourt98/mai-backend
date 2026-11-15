import { z } from 'zod';
import type { NotificationService } from '../services/notification.service';
import type { NotificationJobRepository } from '../repositories/notification-job.repository';
import { HttpError } from '../errors/http-error';

export const notificationMessageDto = z.object({ version: z.literal(1), outboxId: z.uuid() }).strict();
export type NotificationMessage = z.infer<typeof notificationMessageDto>;
export interface NotificationBindings {
  NOTIFICATION_QUEUE: Queue<NotificationMessage>;
  NOTIFICATION_BATCH_SIZE?: string;
  NOTIFICATION_LEASE_SECONDS?: string;
}
export type JobEvent = 'DISCOVERY_FAILED' | 'RESERVATION_FAILED' | 'PUBLICATION_FAILED' | 'CONFIRMATION_FAILED'
  | 'QUEUED' | 'INVALID_MESSAGE' | 'OBSOLETE' | 'DATABASE_FAILED' | 'AWAITING_PUBLICATION' | 'PROVIDER_NOT_CONFIGURED';
// Only fixed categories and server-derived UUIDs; never log exception text or queue bodies.
export type JobLogger = (event: JobEvent, outboxId?: string) => void;
export const jobLogger: JobLogger = (event, outboxId) => console.info(JSON.stringify({ component: 'notifications', event, ...(outboxId ? { outboxId } : {}) }));
export function notificationSettings(bindings: Pick<NotificationBindings, 'NOTIFICATION_BATCH_SIZE' | 'NOTIFICATION_LEASE_SECONDS'>) {
  const integer = (input: string | undefined, fallback: number, max: number) => {
    if (input === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(input) || Number(input) > max) throw new Error('Invalid notification job configuration');
    return Number(input);
  };
  return { limit: integer(bindings.NOTIFICATION_BATCH_SIZE, 20, 100), seconds: integer(bindings.NOTIFICATION_LEASE_SECONDS, 60, 300) };
}
const unavailable = (error: unknown) => error instanceof HttpError && [401, 404, 409].includes(error.status);

export class NotificationProcessor {
  constructor(private readonly jobs: NotificationJobRepository, private readonly notifications: NotificationService,
    private readonly logger: JobLogger = jobLogger, private readonly now = () => new Date()) {}

  async dispatch(queue: Pick<Queue<NotificationMessage>, 'send'>, settings: { limit: number; seconds: number }) {
    let candidates;
    try { candidates = await this.jobs.due(this.now(), settings.limit); }
    catch { this.logger('DISCOVERY_FAILED'); throw new Error('Notification discovery failed'); }
    for (const candidate of candidates) {
      let claim;
      try { claim = await this.notifications.reserveDispatch(candidate.ownerId, candidate.id, settings.seconds); }
      catch (error) {
        this.logger('RESERVATION_FAILED', candidate.id);
        if (unavailable(error)) continue;
        // Worker exception logging must never serialize driver credentials via Error.cause.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('Notification reservation failed');
      }
      if (!claim) continue;
      try { await queue.send({ version: 1, outboxId: claim.id }, { contentType: 'json' }); }
      catch {
        // The response can be lost after acceptance. Leave publication lease intact:
        // expiry allows recovery and duplicates remain harmless before any provider.
        this.logger('PUBLICATION_FAILED', claim.id);
        continue;
      }
      try {
        const row = await this.notifications.published(claim.ownerId, claim.id, claim.leaseToken!);
        this.logger(row.status === 'PUBLISHED' ? 'QUEUED' : 'OBSOLETE', claim.id);
      } catch { this.logger('CONFIRMATION_FAILED', claim.id); }
    }
  }

  async consume(message: Pick<Message<unknown>, 'body' | 'ack' | 'retry'>) {
    const parsed = notificationMessageDto.safeParse(message.body);
    if (!parsed.success) { this.logger('INVALID_MESSAGE'); message.ack(); return; }
    const id = parsed.data.outboxId;
    try {
      const identity = await this.jobs.locate(id);
      if (!identity) { this.logger('OBSOLETE', id); message.ack(); return; }
      const row = await this.notifications.prepareDelivery(identity.ownerId, id);
      if (row.status === 'RESERVED' && row.reservedFrom === 'PENDING') {
        this.logger('AWAITING_PUBLICATION', id); message.retry({ delaySeconds: 60 }); return;
      }
      if (row.status !== 'PUBLISHED' || row.scheduledAt > this.now()) {
        this.logger('OBSOLETE', id); message.ack(); return;
      }
      // Future adapter boundary: revalidate and acquire a delivery lease here before
      // an actual provider call. Do not mark SENT, FAILED or reserve delivery today.
      this.logger('PROVIDER_NOT_CONFIGURED', id);
      message.ack();
    } catch (error) {
      if (unavailable(error)) { this.logger('OBSOLETE', id); message.ack(); return; }
      // No provider has been invoked. Only infrastructure reads/preflight can retry.
      this.logger('DATABASE_FAILED', id); message.retry({ delaySeconds: 60 });
    }
  }
}
