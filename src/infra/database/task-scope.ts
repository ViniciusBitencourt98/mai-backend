import { createDatabaseClient } from './client';
import { createTaskRepository } from './task-persistence';
import { TaskService } from '../../services/task.service';
import type { DatabaseBindings } from './config';
export function createTaskScope(bindings: DatabaseBindings) {
  return async function withTasks<T>(operation: (service: TaskService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new TaskService(createTaskRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
