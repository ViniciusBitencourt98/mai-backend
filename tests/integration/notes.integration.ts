import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createNoteRepository } from '../../src/infra/database/note-persistence';
import { NoteService } from '../../src/services/note.service';
import { createNoteDto, noteQueryDto } from '../../src/notes/dto';
const configured = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
if (process.env.DATABASE_URL || process.env.DIRECT_URL) requireDevelopmentDatabase(process.env);
// Real PostgreSQL only. Apply the migration separately in an authorized development database.
describe.skipIf(!configured)('notes — real Neon development (pending without credentials)', () => {
  const owner = randomUUID(); const other = randomUUID();
  let client: ReturnType<typeof createDatabaseClient>;
  let service: NoteService;
  beforeAll(async () => {
    client = createDatabaseClient(process.env.DATABASE_URL);
    service = new NoteService(createNoteRepository(client));
    await client.user.createMany({ data: [owner, other].map((id) => ({ id, email: `notes-${id}@example.invalid`, name: 'Synthetic', passwordHash: 'unusable' })) });
  });
  afterAll(async () => {
    if (!client) return;
    try {
      await client.note.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.project.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.user.deleteMany({ where: { id: { in: [owner, other] } } });
    } finally { await client.$disconnect(); }
  });
  it('persists independent notes, links, tags, filters, archive/restore and enforces the composite ownership FK', async () => {
    const row = await service.create(owner, createNoteDto.parse({ title: 'Idea 100%', tags: ['Film'] }));
    expect(row.projectId).toBeNull();
    const ownProject = await client.project.create({ data: { ownerId: owner, name: 'Own' } });
    const foreign = await client.project.create({ data: { ownerId: other, name: 'Foreign' } });
    await expect(service.update(owner, row.id, { projectId: foreign.id })).rejects.toMatchObject({ status: 404 });
    // Direct DB write proves ownership is enforced independently of the service check.
    await expect(client.note.update({ where: { id: row.id }, data: { projectId: foreign.id } })).rejects.toMatchObject({ code: 'P2003' });
    await service.update(owner, row.id, { content: 'Text', projectId: ownProject.id, tags: ['film', 'idea'] });
    expect((await service.list(owner, noteQueryDto.parse({ tag: 'film', projectId: ownProject.id, q: '100%' }))).items).toHaveLength(1);
    expect((await service.list(other, noteQueryDto.parse({}))).items).toHaveLength(0);
    await expect(service.get(other, row.id)).rejects.toMatchObject({ status: 404 });
    await service.update(owner, row.id, { projectId: null, tags: [] });
    expect((await service.list(owner, noteQueryDto.parse({ withoutProject: 'true' }))).items[0]?.content).toBe('Text');
    const archived = await service.archive(owner, row.id);
    expect((await service.archive(owner, row.id)).archivedAt).toEqual(archived.archivedAt);
    expect((await service.list(owner, noteQueryDto.parse({}))).items).toHaveLength(0);
    expect((await service.list(owner, noteQueryDto.parse({ includeArchived: 'true' }))).items).toHaveLength(1);
    expect((await service.restore(owner, row.id)).archivedAt).toBeNull();
  });
});
