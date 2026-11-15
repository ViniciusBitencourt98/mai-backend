import { createDatabaseClient } from './client';
import { createDashboardRepository } from './dashboard-persistence';
import { createCalendarScope } from './calendar-scope';
import { DashboardService } from '../../services/dashboard.service';
import type { DatabaseBindings } from './config';
export function createDashboardScope(bindings: DatabaseBindings) {
  return async function withDashboard<T>(operation: (service: DashboardService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new DashboardService(createDashboardRepository(client), { run: createCalendarScope(bindings) })); }
    finally { await client.$disconnect(); }
  };
}
