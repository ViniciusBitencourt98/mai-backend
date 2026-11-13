import type { PrismaClient } from '../../generated/prisma/client';
import type { ProjectRepository } from '../../repositories/project.repository';

export function createProjectRepository(client: PrismaClient): ProjectRepository {
  return {
    list(ownerId, query) {
      return client.project.findMany({ where: { ownerId,
        ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
        ...(query.status ? { AND: { status: query.status } } : {}),
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      }, orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit, take: query.limit + 1 });
    },
    find(ownerId, id) { return client.project.findFirst({ where: { id, ownerId } }); },
    create(ownerId, data) { return client.project.create({ data: { ...data, ownerId } }); },
    async update(ownerId, id, data) {
      // Ownership is part of the atomic mutation predicate, not only a prior read.
      const rows = await client.project.updateManyAndReturn({ where: { id, ownerId }, data });
      return rows[0] ?? null;
    },
  };
}
