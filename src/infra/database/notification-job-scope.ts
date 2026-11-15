import { createDatabaseClient } from './client';
import { createNotificationJobRepository } from './notification-job-persistence';
import { createNotificationRepository } from './notification-persistence';
import { NotificationService } from '../../services/notification.service';
import { NotificationProcessor, jobLogger } from '../../notifications/processing';
import type { DatabaseBindings } from './config';
export async function withNotificationProcessor<T>(bindings: DatabaseBindings, operation: (processor: NotificationProcessor) => Promise<T>) {
  const client = createDatabaseClient(bindings.DATABASE_URL);
  try {
    return await operation(new NotificationProcessor(createNotificationJobRepository(client), new NotificationService(createNotificationRepository(client))));
  } finally {
    // A disconnect error must not leak a URL/driver error into Workers logs.
    try { await client.$disconnect(); } catch { jobLogger('DATABASE_FAILED'); }
  }
}
