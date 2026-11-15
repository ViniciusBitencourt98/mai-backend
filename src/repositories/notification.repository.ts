import type { PreferencesRecord } from '../preferences/dto';
import type { ReminderInput, ReminderIntent, ReminderRecord, IntentData, OutboxRecord, NotificationQuery, DeliveryRecord, NotificationResult, FailureCategory } from '../notifications/dto';
export interface NotificationSource { at: Date; version: string; timezone: string; recurrenceRuleId: string | null; recurrenceVersion: number | null; occurrenceDate: Date | null; }
export interface NotificationContext { preferences: Omit<PreferencesRecord, 'name'>; rule: ReminderRecord | null; source: NotificationSource | null; }
export interface NotificationChange { patch: Partial<Pick<OutboxRecord, 'status' | 'leaseToken' | 'leaseUntil' | 'reservedFrom' | 'attemptCount' | 'publishedAt' | 'sentAt' | 'failedAt' | 'cancelledAt' | 'lastError' | 'providerMessageId'>>; result: NotificationResult; at: Date; error?: FailureCategory; }
export interface NotificationRepository {
  configure(ownerId: string, input: ReminderInput): Promise<ReminderRecord>;
  enqueue(ownerId: string, reminder: ReminderIntent | null, build: (context: NotificationContext) => IntentData, validateNew: (data: IntentData) => void): Promise<OutboxRecord>;
  mutate(ownerId: string, id: string, operation: (row: OutboxRecord, context: NotificationContext) => NotificationChange | null): Promise<OutboxRecord>;
  get(ownerId: string, id: string): Promise<OutboxRecord | null>;
  list(ownerId: string, query: NotificationQuery): Promise<OutboxRecord[]>;
  history(ownerId: string, id: string, query: NotificationQuery): Promise<DeliveryRecord[]>;
}
