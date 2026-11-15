import { GmailTransport, type EmailBindings } from '../../notifications/email';
import { NotificationDelivery } from '../../notifications/delivery';
import { createEmailContent } from './email-content';
import { planDigests } from './digest-planner';
import { createDatabaseClient } from './client';
import { createNotificationJobRepository } from './notification-job-persistence';
import { createNotificationRepository } from './notification-persistence';
import { NotificationService } from '../../services/notification.service';
import { NotificationProcessor, jobLogger } from '../../notifications/processing';
import type { DatabaseBindings } from './config';
export async function withNotificationProcessor<T>(bindings: DatabaseBindings & EmailBindings, operation: (processor: NotificationProcessor) => Promise<T>) {
  const client = createDatabaseClient(bindings.DATABASE_URL);
  try {
    const service = new NotificationService(createNotificationRepository(client));
    const delivery = bindings.EMAIL_DELIVERY_ENABLED === 'true' ? new NotificationDelivery(service,createEmailContent(client,bindings),new GmailTransport(bindings),jobLogger) : undefined;
    return await operation(new NotificationProcessor(createNotificationJobRepository(client), service, jobLogger, () => new Date(), delivery, () => planDigests(client,service)));
  } finally {
    // A disconnect error must not leak a URL/driver error into Workers logs.
    try { await client.$disconnect(); } catch { jobLogger('DATABASE_FAILED'); }
  }
}
