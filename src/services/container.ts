import { createProjectScope } from '../infra/database/project-scope';
import type { ProjectDependencies } from './project.service';
import { createPersistenceScope } from '../infra/database/scope';
import { createAuthScope } from '../infra/database/auth-scope';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings, type AuthBindings } from '../auth/settings';
import type { DatabaseBindings } from '../infra/database/config';

export function createApplicationServices(bindings: DatabaseBindings & AuthBindings, clientAddress?: AuthDependencies['clientAddress']) {
  // Lazy: /health works without DATABASE_URL and never contacts PostgreSQL.
  const auth: AuthDependencies = { run: createAuthScope(bindings), settings: authSettings(bindings),
    ...(clientAddress ? { clientAddress } : {}) };
  const projects: ProjectDependencies = { run: createProjectScope(bindings) };
  return { projects, withTechnicalProbes: createPersistenceScope(bindings),
    auth };
}

export type ApplicationServices = Omit<ReturnType<typeof createApplicationServices>, 'projects'> & { projects?: ProjectDependencies };
