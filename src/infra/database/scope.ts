import { createDatabaseClient } from './client';
import { createProbePersistence } from './probe-persistence';
import { TechnicalProbeService } from '../../services/technical-probe.service';
import type { DatabaseBindings } from './config';

export function createPersistenceScope(bindings: DatabaseBindings, factory = createDatabaseClient) {
  return async function withTechnicalProbes<T>(operation: (service: TechnicalProbeService) => Promise<T>) {
    const client = factory(bindings.DATABASE_URL);
    try {
      return await operation(new TechnicalProbeService(createProbePersistence(client)));
    } finally {
      await client.$disconnect();
    }
  };
}
