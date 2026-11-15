import { z } from 'zod';
import { dateDto } from '../recurrence/dto';
export const sourceTypeDto = z.enum(['TASK', 'EVENT', 'PUBLICATION']);
export const notificationStatusDto = z.enum(['PENDING', 'RESERVED', 'PUBLISHED', 'SENT', 'FAILED', 'CANCELLED']);
export const failureCategoryDto = z.enum(['NETWORK', 'PROVIDER_REJECTED', 'INTERNAL', 'LEASE_EXPIRED', 'STALE', 'USER_CANCELLED']);
export const reminderRuleDto = z.object({ sourceType: sourceTypeDto, sourceId: z.uuid(),
  leadMinutes: z.number().int().min(0).max(43200), enabled: z.boolean().default(true) }).strict();
export const reminderIntentDto = z.object({ reminderRuleId: z.uuid(), occurrenceDate: dateDto.optional() }).strict();
export const digestIntentDto = z.object({ date: dateDto }).strict();
export const leaseDto = z.object({ seconds: z.number().int().min(1).max(300).default(60) }).strict();
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
export const notificationQueryDto = z.object({ page: integer(10000).default(1), limit: integer(100).default(20), status: notificationStatusDto.optional() }).strict();
export type SourceType = z.infer<typeof sourceTypeDto>;
export type SourceRef = { sourceType: SourceType; sourceId: string };
export type ReminderInput = z.infer<typeof reminderRuleDto>;
export type ReminderIntent = z.infer<typeof reminderIntentDto>;
export type NotificationQuery = z.infer<typeof notificationQueryDto>;
export type FailureCategory = z.infer<typeof failureCategoryDto>;
export type NotificationStatus = z.infer<typeof notificationStatusDto>;
export type NotificationType = 'TASK_REMINDER' | 'EVENT_REMINDER' | 'PUBLICATION_REMINDER' | 'DAILY_DIGEST';
export interface ReminderRecord extends ReminderInput { id: string; ownerId: string; version: number; createdAt: Date; updatedAt: Date; }
export interface IntentData {
  type: NotificationType; sourceType: SourceType | null; sourceId: string | null; reminderRuleId: string | null; ruleVersion: number | null;
  sourceVersion: string; recurrenceRuleId: string | null; recurrenceVersion: number | null; occurrenceDate: Date | null; digestDate: Date | null;
  timezone: string; scheduledAt: Date; idempotencyKey: string;
}
export interface OutboxRecord extends IntentData {
  id: string; ownerId: string; status: NotificationStatus; leaseToken: string | null; leaseUntil: Date | null; reservedFrom: NotificationStatus | null;
  attemptCount: number; publishedAt: Date | null; sentAt: Date | null; failedAt: Date | null; cancelledAt: Date | null;
  lastError: FailureCategory | null; providerMessageId: string | null; createdAt: Date; updatedAt: Date;
}
export type NotificationResult = 'CREATED' | 'RESERVED' | 'QUEUED' | 'PROVIDER_ACCEPTED' | 'FAILED' | 'CANCELLED';
export interface DeliveryRecord { id: string; outboxId: string; ownerId: string; status: NotificationStatus; attemptedAt: Date; result: NotificationResult; errorCategory: FailureCategory | null; providerMessageId: string | null; }
