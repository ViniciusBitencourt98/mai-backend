import type { PrismaClient } from '../../generated/prisma/client';
import type { DecupageRepository } from '../../repositories/decupage.repository';
import { HttpError } from '../../errors/http-error';

export function createDecupageRepository(client: PrismaClient): DecupageRepository {
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
    async listSegments(ownerId, id) {
      const parent = await client.decupage.findFirst({ where: { id, ownerId }, select: { segments: { orderBy: { position: 'asc' }, take: 100 } } });
      return parent?.segments ?? null;
    },
    async mutateSegments(ownerId, id, operation) {
      return client.$transaction(async (tx) => {
        // A scoped parent UPDATE locks the row and serializes ALL segment mutations.
        const locked = await tx.decupage.updateMany({ where: { id, ownerId }, data: { updatedAt: new Date() } });
        if (!locked.count) throw new HttpError(404, 'NOT_FOUND', 'Decupage not found');
        const before = await tx.decupageSegment.findMany({ where: { decupageId: id }, orderBy: { position: 'asc' }, take: 101 });
        if (before.length > 100) throw new HttpError(409, 'SEGMENT_LIMIT', 'Maximum 100 segments per decupage');
        const after = operation(before);
        await tx.decupageSegment.deleteMany({ where: { decupageId: id, id: { notIn: after.map((segment) => segment.id) } } });
        for (const segment of after) {
          const previous = before.find((row) => row.id === segment.id);
          if (!previous) await tx.decupageSegment.create({ data: segment });
          else if (JSON.stringify(previous) !== JSON.stringify(segment)) {
            await tx.decupageSegment.updateMany({ where: { id: segment.id, decupageId: id },
              data: { position: segment.position, startMs: segment.startMs, endMs: segment.endMs, description: segment.description, updatedAt: segment.updatedAt } });
          }
        }
        return after;
      }, { timeout: 15000, maxWait: 10000 });
    },
    list(ownerId, query) {
      return client.decupage.findMany({ where: { ownerId,
        ...(!query.includeArchived ? { archivedAt: null } : {}),
        ...(query.q ? { OR: [
          { title: { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } },
          { description: { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } },
          { segments: { some: { description: { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } } },
        ] } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.projectId ? { projectId: query.projectId } : query.withoutProject ? { projectId: null } : {}),
      }, orderBy: [{ [query.sort]: query.order }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit + 1 });
    },
    find(ownerId, id) { return client.decupage.findFirst({ where: { id, ownerId } }); },
    async ownsProject(ownerId, id) { return Boolean(await client.project.findFirst({ where: { id, ownerId }, select: { id: true } })); },
    create(ownerId, data) { return write(() => client.decupage.create({ data: { ...data, ownerId } })); },
    async update(ownerId, id, data) {
      const rows = await write(() => client.decupage.updateManyAndReturn({ where: { id, ownerId }, data }));
      return rows[0] ?? null;
    },
    async setArchived(ownerId, id, at) {
      // Conditional mutation preserves the original archive timestamp on retries, even concurrently.
      await client.decupage.updateMany({ where: { id, ownerId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } });
      return client.decupage.findFirst({ where: { id, ownerId } });
    },
  };
}
