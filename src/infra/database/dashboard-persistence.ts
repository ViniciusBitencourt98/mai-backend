import type { PrismaClient } from '../../generated/prisma/client';
import type { DashboardRepository } from '../../repositories/dashboard.repository';
export function createDashboardRepository(client: PrismaClient): DashboardRepository {
  return {
    // Database aggregate, no unbounded row loading. One master per task, including undated/recurring.
    pendingTasks(ownerId) { return client.task.count({ where: { ownerId, archivedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] } } }); },
  };
}
