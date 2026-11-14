import { createDatabaseClient } from './client';
import { createPublicationRepository } from './publication-persistence';
import { PublicationService } from '../../services/publication.service';
import type { DatabaseBindings } from './config';
export function createPublicationScope(bindings: DatabaseBindings) {
  return async function withPublications<T>(operation: (service: PublicationService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new PublicationService(createPublicationRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
