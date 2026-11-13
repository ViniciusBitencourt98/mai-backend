import { createDatabaseClient } from './client';
import { createEventRepository } from './event-persistence';
import { EventService } from '../../services/event.service';
import type { DatabaseBindings } from './config';
export function createEventScope(bindings: DatabaseBindings) {
  return async function withEvent<T>(operation: (service: EventService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new EventService(createEventRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
