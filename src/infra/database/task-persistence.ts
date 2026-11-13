import { civilDate } from '../../tasks/dto';
import type { PrismaClient } from '../../generated/prisma/client';
import type { TaskRepository } from '../../repositories/task.repository';
import { HttpError } from '../../errors/http-error';

export function createTaskRepository(client: PrismaClient): TaskRepository {
  // The composite FK additionally prevents cross-owner links and races with project deletion.
  async function write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003')
        throw new HttpError(404, 'NOT_FOUND', 'Project not found');
      throw error;
    }
  }
  return {
    async listSubtasks(ownerId, id) {
      const parent = await client.task.findFirst({ where: { id, ownerId }, select: { subtasks: { orderBy: { position: 'asc' }, take: 100 } } });
      return parent?.subtasks ?? null;
    },
    async mutateSubtasks(ownerId, id, operation) {
      return client.$transaction(async (tx) => {
        // A scoped parent UPDATE locks the row and serializes ALL subtask mutations.
        const locked = await tx.task.updateMany({ where: { id, ownerId }, data: { updatedAt: new Date() } });
        if (!locked.count) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
        const before = await tx.subtask.findMany({ where: { taskId: id }, orderBy: { position: 'asc' }, take: 101 });
        if (before.length > 100) throw new HttpError(409, 'SUBTASK_LIMIT', 'Maximum 100 subtasks per task');
        const after = operation(before);
        await tx.subtask.deleteMany({ where: { taskId: id, id: { notIn: after.map((subtask) => subtask.id) } } });
        for (const subtask of after) {
          const previous = before.find((row) => row.id === subtask.id);
          if (!previous) await tx.subtask.create({ data: subtask });
          else if (JSON.stringify(previous) !== JSON.stringify(subtask)) {
            await tx.subtask.updateMany({ where: { id: subtask.id, taskId: id },
              data: { position: subtask.position, title: subtask.title, completed: subtask.completed, updatedAt: subtask.updatedAt } });
          }
        }
        return after;
      }, { timeout: 15000, maxWait: 10000 });
    },
    list(ownerId, query, today) {
      const range = { ...(query.dueFrom ? { gte: civilDate(query.dueFrom)! } : {}), ...(query.dueTo ? { lte: civilDate(query.dueTo)! } : {}), ...(query.overdue ? { lt: civilDate(today)! } : {}) };
      return client.task.findMany({ where: { ownerId,
        ...(!query.includeArchived ? { archivedAt: null } : {}),
        ...(query.q ? { title: { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } : {}),
        ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}),
        ...(query.overdue ? { AND: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } : {}),
        ...(query.withoutDueDate ? { dueDate: null } : Object.keys(range).length ? { dueDate: range } : {}),
        ...(query.projectId ? { projectId: query.projectId } : query.withoutProject ? { projectId: null } : {}),
      }, orderBy: [query.sort === 'dueDate' ? { dueDate: { sort: query.order, nulls: 'last' } } : { [query.sort]: query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit, take: query.limit + 1 });
    },
    find(ownerId, id) { return client.task.findFirst({ where: { id, ownerId } }); },
    async ownsProject(ownerId, id) { return Boolean(await client.project.findFirst({ where: { id, ownerId }, select: { id: true } })); },
    create(ownerId, data) { return write(() => client.task.create({ data: { ...data, ownerId } })); },
    async mutate(ownerId, id, operation) {
      return write(() => client.$transaction(async (tx) => {
        const locked = await tx.task.updateMany({ where: { id, ownerId }, data: { updatedAt: new Date() } });
        if (!locked.count) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
        const current = await tx.task.findFirstOrThrow({ where: { id, ownerId } });
        const data = operation(current);
        // Whitelist columns even when callbacks carry a full existing record.
        const rows = await tx.task.updateManyAndReturn({ where: { id, ownerId }, data: {
          title: data.title, description: data.description, status: data.status, priority: data.priority,
          startDate: data.startDate, dueDate: data.dueDate, completedAt: data.completedAt,
          projectId: data.projectId, archivedAt: data.archivedAt,
        } });
        return rows[0]!;
      }));
    },
  };
}
