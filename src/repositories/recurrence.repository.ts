import type { RecurrenceSnapshot, RecurrenceChange } from '../recurrence/dto';
export interface RecurrenceRepository {
  read(ownerId: string, taskId: string, ruleId?: string): Promise<RecurrenceSnapshot>;
  mutate<T>(ownerId: string, taskId: string, operation: (snapshot: RecurrenceSnapshot) => { change: RecurrenceChange; result: T }): Promise<T>;
}
