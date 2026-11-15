import {createReminderDependencies} from '../infra/database/reminder-scope';
import type {ReminderDependencies} from './reminder.service';
import { createPreferencesScope } from '../infra/database/preferences-scope';
import type { PreferencesDependencies } from './preferences.service';
import { createDashboardScope } from '../infra/database/dashboard-scope';
import type { DashboardDependencies } from './dashboard.service';
import { createPublicationScope } from '../infra/database/publication-scope';
import type { PublicationDependencies } from './publication.service';
import { createCalendarScope } from '../infra/database/calendar-scope';
import type { CalendarDependencies } from './calendar.service';
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
  const publications: PublicationDependencies = { run: createPublicationScope(bindings) };
  const notes: NoteDependencies = { run: createNoteScope(bindings) };
  const decupages: DecupageDependencies = { run: createDecupageScope(bindings) };
  const tasks: TaskDependencies = { run: createTaskScope(bindings) };
  const recurrence: RecurrenceDependencies = { run: createRecurrenceScope(bindings) };
  const events: EventDependencies = { run: createEventScope(bindings) };
  const calendar:CalendarDependencies={run:createCalendarScope(bindings)};
  const dashboard: DashboardDependencies = { run: createDashboardScope(bindings) };
  const preferences: PreferencesDependencies = { run: createPreferencesScope(bindings) };
  const reminders=createReminderDependencies(bindings);
  return { reminders, preferences, dashboard, publications, calendar, events, recurrence, tasks, decupages, notes, projects, withTechnicalProbes: createPersistenceScope(bindings),
    auth };
}

export type ApplicationServices = Omit<ReturnType<typeof createApplicationServices>, 'projects' | 'notes' | 'decupages' | 'tasks' | 'recurrence' | 'events' | 'calendar' | 'publications' | 'dashboard' | 'preferences' | 'reminders'> & { reminders?: ReminderDependencies; preferences?: PreferencesDependencies; dashboard?: DashboardDependencies; publications?: PublicationDependencies; projects?: ProjectDependencies; notes?: NoteDependencies; decupages?: DecupageDependencies; tasks?: TaskDependencies; recurrence?: RecurrenceDependencies; events?: EventDependencies; calendar?: CalendarDependencies };
