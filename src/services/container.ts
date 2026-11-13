import { createPersistenceScope } from '../infra/database/scope';
import type { DatabaseBindings } from '../infra/database/config';

export function createApplicationServices(bindings: DatabaseBindings) {
  // Lazy: /health works without DATABASE_URL and never contacts PostgreSQL.
  return { withTechnicalProbes: createPersistenceScope(bindings) };
}

export type ApplicationServices = ReturnType<typeof createApplicationServices>;
