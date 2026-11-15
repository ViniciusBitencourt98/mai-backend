import { withNotificationProcessor } from '../infra/database/notification-job-scope';
import { jobLogger, notificationMessageDto, notificationSettings, type NotificationBindings } from './processing';
import type { DatabaseBindings } from '../infra/database/config';
type Bindings = DatabaseBindings & NotificationBindings;
export async function scheduled(_controller: ScheduledController, bindings: Bindings) {
  try {
    const settings = notificationSettings(bindings);
    await withNotificationProcessor(bindings, processor => processor.dispatch(bindings.NOTIFICATION_QUEUE, settings));
  } catch {
    jobLogger('DATABASE_FAILED');
    throw new Error('Notification scheduled processing failed');
  }
}
export async function queue(batch: MessageBatch<unknown>, bindings: Bindings) {
  const messages = batch.messages.filter(message => {
    if (notificationMessageDto.safeParse(message.body).success) return true;
    jobLogger('INVALID_MESSAGE'); message.ack(); return false;
  });
  if (!messages.length) return;
  try {
    await withNotificationProcessor(bindings, async processor => {
      for (const message of messages) await processor.consume(message);
    });
  } catch {
    // Connection initialization failed before any provider call. Bounded by max_retries/DLQ.
    jobLogger('DATABASE_FAILED');
    for (const message of messages) message.retry({ delaySeconds: 60 });
  }
}
