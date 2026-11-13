import { createDatabaseClient } from './client';
import { createProjectRepository } from './project-persistence';
import { ProjectService } from '../../services/project.service';
import type { DatabaseBindings } from './config';
export function createProjectScope(bindings: DatabaseBindings) {
  return async function withProjects<T>(operation: (service: ProjectService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new ProjectService(createProjectRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
