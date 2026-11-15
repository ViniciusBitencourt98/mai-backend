import type { OutboxRecord } from './dto';
import type { NotificationService } from '../services/notification.service';
import { EmailFailure, type Email, type EmailTransport } from './email';
export interface DeliveryContent { prepare(row: OutboxRecord): Promise<Email>; }
export class NotificationDelivery {
  constructor(private readonly service: NotificationService, private readonly content: DeliveryContent, private readonly transport: EmailTransport,
    private readonly log: (event: 'DELIVERY_FAILED' | 'PROVIDER_ACCEPTED' | 'DELIVERY_UNCERTAIN', id: string) => void) {}
  async deliver(row: OutboxRecord) {
    // Content reads may fail/retry safely before a delivery reservation exists.
    const email = await this.content.prepare(row);
    const claim = await this.service.reserve(row.ownerId, row.id, {seconds:300});
    if (claim.status !== 'RESERVED' || claim.reservedFrom !== 'PUBLISHED') return;
    // Once leased, no exception may cause automatic retry of a provider call.
    try {
      const current = await this.service.prepareDelivery(row.ownerId, row.id);
      if (current.status !== 'RESERVED' || current.leaseToken !== claim.leaseToken || !current.leaseUntil || current.leaseUntil <= new Date()) return;
      const accepted = await this.transport.send(email);
      try { await this.service.accepted(row.ownerId, row.id, {leaseToken:claim.leaseToken, ...accepted}); this.log('PROVIDER_ACCEPTED',row.id); }
      catch { this.log('DELIVERY_UNCERTAIN',row.id); }
    } catch (error) {
      try { await this.service.fail(row.ownerId, row.id, {leaseToken:claim.leaseToken, category:error instanceof EmailFailure ? error.category : 'INTERNAL'}); this.log('DELIVERY_FAILED',row.id); }
      catch { this.log('DELIVERY_UNCERTAIN',row.id); }
    }
  }
}
