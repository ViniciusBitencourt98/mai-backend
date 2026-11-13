import { createDatabaseClient } from './client';
import { createRecurrenceRepository } from './recurrence-persistence';
import { RecurrenceService } from '../../services/recurrence.service';
import type { DatabaseBindings } from './config';
export function createRecurrenceScope(bindings: DatabaseBindings) {
  return async function withRecurrence<T>(operation: (service: RecurrenceService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new RecurrenceService(createRecurrenceRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
