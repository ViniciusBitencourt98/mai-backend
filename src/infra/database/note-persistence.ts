import type { PrismaClient } from '../../generated/prisma/client';
import type { NoteRepository } from '../../repositories/note.repository';
import { HttpError } from '../../errors/http-error';

export function createNoteRepository(client: PrismaClient): NoteRepository {
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
    list(ownerId, query) {
      return client.note.findMany({ where: { ownerId,
        ...(!query.includeArchived ? { archivedAt: null } : {}),
        ...(query.q ? { title: { contains: query.q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.projectId ? { projectId: query.projectId } : query.withoutProject ? { projectId: null } : {}),
      }, orderBy: [{ [query.sort]: query.order }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit + 1 });
    },
    find(ownerId, id) { return client.note.findFirst({ where: { id, ownerId } }); },
    async ownsProject(ownerId, id) { return Boolean(await client.project.findFirst({ where: { id, ownerId }, select: { id: true } })); },
    create(ownerId, data) { return write(() => client.note.create({ data: { ...data, ownerId } })); },
    async update(ownerId, id, data) {
      const rows = await write(() => client.note.updateManyAndReturn({ where: { id, ownerId }, data }));
      return rows[0] ?? null;
    },
    async setArchived(ownerId, id, at) {
      // Conditional mutation preserves the original archive timestamp on retries, even concurrently.
      await client.note.updateMany({ where: { id, ownerId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } });
      return client.note.findFirst({ where: { id, ownerId } });
    },
  };
}
