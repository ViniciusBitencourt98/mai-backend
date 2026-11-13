import { createEventScope } from '../infra/database/event-scope';
import type { EventDependencies } from './event.service';
import { createRecurrenceScope } from '../infra/database/recurrence-scope';
import type { RecurrenceDependencies } from './recurrence.service';
import { createTaskScope } from '../infra/database/task-scope';
import type { TaskDependencies } from './task.service';
import { createDecupageScope } from '../infra/database/decupage-scope';
import type { DecupageDependencies } from './decupage.service';
import { createNoteScope } from '../infra/database/note-scope';
import type { NoteDependencies } from './note.service';
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
  const notes: NoteDependencies = { run: createNoteScope(bindings) };
  const decupages: DecupageDependencies = { run: createDecupageScope(bindings) };
  const tasks: TaskDependencies = { run: createTaskScope(bindings) };
  const recurrence: RecurrenceDependencies = { run: createRecurrenceScope(bindings) };
  const events: EventDependencies = { run: createEventScope(bindings) };
  return { events, recurrence, tasks, decupages, notes, projects, withTechnicalProbes: createPersistenceScope(bindings),
    auth };
}

export type ApplicationServices = Omit<ReturnType<typeof createApplicationServices>, 'projects' | 'notes' | 'decupages' | 'tasks' | 'recurrence' | 'events'> & { projects?: ProjectDependencies; notes?: NoteDependencies; decupages?: DecupageDependencies; tasks?: TaskDependencies; recurrence?: RecurrenceDependencies; events?: EventDependencies };
