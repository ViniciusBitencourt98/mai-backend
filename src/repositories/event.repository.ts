import type { EventInput, EventRecord, EventQuery, EventSnapshot, EventChange } from '../events/dto';
export interface EventRepository {
  list(ownerId: string, query: EventQuery): Promise<EventRecord[]>;
  ownsProject(ownerId: string, id: string): Promise<boolean>;
  create(ownerId: string, data: EventInput): Promise<EventRecord>;
  read(ownerId: string, id: string, ruleId?: string): Promise<EventSnapshot>;
  mutate<T>(ownerId: string, id: string, operation: (snapshot: EventSnapshot) => { change: EventChange; result: T }): Promise<T>;
}
