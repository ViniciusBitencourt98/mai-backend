import { createDatabaseClient } from './client';
import { createNotificationRepository } from './notification-persistence';
import { NotificationService } from '../../services/notification.service';
import type { DatabaseBindings } from './config';
/** Internal authorized context only: callers derive owner from session/job authorization. No HTTP API. */
export function createNotificationScope(bindings: DatabaseBindings) {
  return async function withNotifications<T>(operation: (service: NotificationService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new NotificationService(createNotificationRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
