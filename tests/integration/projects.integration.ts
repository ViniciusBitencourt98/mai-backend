import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createProjectRepository } from '../../src/infra/database/project-persistence';
import { ProjectService } from '../../src/services/project.service';
import { createProjectDto, projectQueryDto } from '../../src/projects/dto';

const configured = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
if (process.env.DATABASE_URL || process.env.DIRECT_URL) requireDevelopmentDatabase(process.env);
// Real PostgreSQL only; no mocks and no automatic migration application.
describe.skipIf(!configured)('projects — real Neon development (pending without credentials)', () => {
  let client: ReturnType<typeof createDatabaseClient>;
  let service: ProjectService;
  const owner = randomUUID(); const other = randomUUID();
  beforeAll(async () => {
    client = createDatabaseClient(process.env.DATABASE_URL);
    service = new ProjectService(createProjectRepository(client));
    await client.user.createMany({ data: [owner, other].map((id) => ({ id, email: `projects-${id}@example.invalid`, name: 'Synthetic integration user', passwordHash: 'unusable' })) });
  });
  afterAll(async () => {
    if (!client) return;
    try {
      await client.project.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.user.deleteMany({ where: { id: { in: [owner, other] } } });
    } finally { await client.$disconnect(); }
  });
  it('persists CRUD, filters, pagination and ownership through independent clients', async () => {
    const row = await service.create(owner, createProjectDto.parse({ name: 'Film', startDate: '2026-11-13' }));
    const second = createDatabaseClient(process.env.DATABASE_URL);
    try { expect(await second.project.findUnique({ where: { id: row.id } })).toMatchObject({ name: 'Film', ownerId: owner }); }
    finally { await second.$disconnect(); }
    await expect(service.get(other, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.update(other, row.id, { name: 'Attack' })).rejects.toMatchObject({ status: 404 });
    await expect(service.archive(other, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.restore(other, row.id)).rejects.toMatchObject({ status: 404 });
    expect((await service.update(owner, row.id, { description: 'Edited', dueDate: '2026-12-01' })).description).toBe('Edited');
    expect((await service.archive(owner, row.id)).archivedAt).not.toBeNull();
    expect((await service.list(owner, projectQueryDto.parse({}))).items).toHaveLength(0);
    expect((await service.list(owner, projectQueryDto.parse({ includeArchived: 'true', status: 'ARCHIVED', q: 'film' }))).items).toHaveLength(1);
    expect((await service.restore(owner, row.id)).archivedAt).toBeNull();
    await service.create(owner, createProjectDto.parse({ name: 'Another' }));
    const page = await service.list(owner, projectQueryDto.parse({ limit: '1', sort: 'name', order: 'asc' }));
    expect(page.items[0]?.name).toBe('Another'); expect(page.page.hasMore).toBe(true);
    const last = await service.list(owner, projectQueryDto.parse({ limit: '1', page: '2', sort: 'name', order: 'asc' }));
    expect(last.items[0]?.name).toBe('Film'); expect(last.page.hasMore).toBe(false);
  });
});
