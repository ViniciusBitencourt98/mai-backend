import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { withNotificationProcessor } from '../../src/infra/database/notification-job-scope';
import { scheduled, queue } from '../../src/notifications/handlers';
import type { NotificationProcessor, NotificationBindings } from '../../src/notifications/processing';
vi.mock('../../src/infra/database/notification-job-scope', () => ({ withNotificationProcessor: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const bindings = { NOTIFICATION_QUEUE: { send: vi.fn() } } as unknown as NotificationBindings;
it('connects scheduled handler to dispatcher with bounded settings', async () => {
  const dispatch = vi.fn();
  vi.mocked(withNotificationProcessor).mockImplementation(async (_bindings, operation) => operation({ dispatch } as unknown as NotificationProcessor));
  await scheduled({} as ScheduledController, bindings);
  expect(dispatch).toHaveBeenCalledWith(bindings.NOTIFICATION_QUEUE, { limit: 20, seconds: 60 });
});
it('sanitizes initialization failures and reports scheduled failure', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.mocked(withNotificationProcessor).mockRejectedValueOnce(new Error('secret-database-url'));
  await expect(scheduled({} as ScheduledController, bindings)).rejects.toThrow('Notification scheduled processing failed');
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
});
it('acks invalid messages without requiring DB and retries only valid ones if initialization fails', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const valid = { body: { version: 1, outboxId: randomUUID() }, ack: vi.fn(), retry: vi.fn() };
  const invalid = { body: { credential: 'secret' }, ack: vi.fn(), retry: vi.fn() };
  vi.mocked(withNotificationProcessor).mockRejectedValueOnce(new Error('secret'));
  await queue({ messages: [valid, invalid] } as unknown as MessageBatch<unknown>, bindings);
  expect(invalid.ack).toHaveBeenCalledOnce(); expect(invalid.retry).not.toHaveBeenCalled();
  expect(valid.retry).toHaveBeenCalledWith({ delaySeconds: 60 }); expect(valid.ack).not.toHaveBeenCalled();
  vi.mocked(withNotificationProcessor).mockClear();
  await queue({ messages: [invalid] } as unknown as MessageBatch<unknown>, bindings);
  expect(withNotificationProcessor).not.toHaveBeenCalled();
});
it('awaits each message operation in a batch', async () => {
  const consume = vi.fn().mockResolvedValue(undefined);
  vi.mocked(withNotificationProcessor).mockImplementation(async (_bindings, operation) => operation({ consume } as unknown as NotificationProcessor));
  const messages = [1,2].map(() => ({ body: { version: 1, outboxId: randomUUID() }, ack: vi.fn(), retry: vi.fn() }));
  await queue({ messages } as unknown as MessageBatch<unknown>, bindings);
  expect(consume.mock.calls.map(call => call[0])).toEqual(messages);
});
