import type { PrismaClient } from '../../generated/prisma/client';
import type { PublicationRepository } from '../../repositories/publication.repository';
import { HttpError } from '../../errors/http-error';

export function createPublicationRepository(client: PrismaClient): PublicationRepository {
  async function write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003')
        throw new HttpError(404, 'NOT_FOUND', 'Project not found');
      throw error;
    }
  }
  return {
    list(ownerId, query) {
      return client.publication.findMany({ where: { ownerId,
        ...(!query.includeArchived ? { archivedAt: null } : {}),
        ...(query.q ? { title: { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.format ? { format: query.format } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.from || query.to ? { scheduledAt: {
          ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}),
        } } : {}),
      }, orderBy: [{ [query.sort]: query.sort === 'scheduledAt' ? { sort: query.order, nulls: 'last' } : query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit, take: query.limit + 1 });
    },
    find(ownerId, id) { return client.publication.findFirst({ where: { id, ownerId } }); },
    async ownsProject(ownerId, id) { return Boolean(await client.project.findFirst({ where: { id, ownerId }, select: { id: true } })); },
    create(ownerId, data) { return write(() => client.publication.create({ data: { ...data, ownerId } })); },
    async update(ownerId, id, data) {
      const rows = await write(() => client.publication.updateManyAndReturn({ where: { id, ownerId }, data }));
      return rows[0] ?? null;
    },
    async setArchived(ownerId, id, at) {
      await client.publication.updateMany({ where: { id, ownerId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } });
      return client.publication.findFirst({ where: { id, ownerId } });
    },
  };
}
