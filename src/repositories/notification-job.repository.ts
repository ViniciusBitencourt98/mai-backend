import type { OutboxRecord } from '../notifications/dto';
/** Internal job discovery only; owners are read from persistence, never from queue input. */
export interface NotificationJobRepository {
  due(now: Date, limit: number): Promise<Pick<OutboxRecord, 'id' | 'ownerId'>[]>;
  locate(id: string): Promise<Pick<OutboxRecord, 'id' | 'ownerId'> | null>;
}
