import { createDatabaseClient } from './client';
import { createDecupageRepository } from './decupage-persistence';
import { DecupageService } from '../../services/decupage.service';
import type { DatabaseBindings } from './config';
export function createDecupageScope(bindings: DatabaseBindings) {
  return async function withDecupages<T>(operation: (service: DecupageService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new DecupageService(createDecupageRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
