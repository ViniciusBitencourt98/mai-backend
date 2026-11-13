import { createPersistenceScope } from '../infra/database/scope';
import { createAuthScope } from '../infra/database/auth-scope';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings, type AuthBindings } from '../auth/settings';
import type { DatabaseBindings } from '../infra/database/config';

export function createApplicationServices(bindings: DatabaseBindings & AuthBindings, clientAddress?: AuthDependencies['clientAddress']) {
  // Lazy: /health works without DATABASE_URL and never contacts PostgreSQL.
  const auth: AuthDependencies = { run: createAuthScope(bindings), settings: authSettings(bindings),
    ...(clientAddress ? { clientAddress } : {}) };
  return { withTechnicalProbes: createPersistenceScope(bindings),
    auth };
}

export type ApplicationServices = ReturnType<typeof createApplicationServices>;
