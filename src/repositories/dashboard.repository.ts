export interface DashboardRepository {
  pendingTasks(ownerId: string): Promise<number>;
}
