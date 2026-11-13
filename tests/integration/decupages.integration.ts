import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createDecupageRepository } from '../../src/infra/database/decupage-persistence';
import { DecupageService } from '../../src/services/decupage.service';
import { createDecupageDto, createSegmentDto } from '../../src/decupages/dto';
const configured = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
if (process.env.DATABASE_URL || process.env.DIRECT_URL) requireDevelopmentDatabase(process.env);
describe.skipIf(!configured)('decupages — real Neon development; no mocks or automatic migrations', () => {
  const owner = randomUUID(); const other = randomUUID();
  let client: ReturnType<typeof createDatabaseClient>;
  let service: DecupageService;
  beforeAll(async () => {
    client = createDatabaseClient(process.env.DATABASE_URL); service = new DecupageService(createDecupageRepository(client));
    await client.user.createMany({ data: [owner, other].map((id) => ({ id, email: `decupages-${id}@example.invalid`, name: 'Synthetic', passwordHash: 'unusable' })) });
  });
  afterAll(async () => {
    if (!client) return;
    try {
      await client.decupage.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.project.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.user.deleteMany({ where: { id: { in: [owner, other] } } });
    } finally { await client.$disconnect(); }
  });
  it('persists independent segments, swaps positions atomically and rolls back invalid changes', async () => {
    const parent = await service.create(owner, createDecupageDto.parse({ title: 'Interview' })); expect(parent.projectId).toBeNull();
    await service.addSegment(owner, parent.id, createSegmentDto.parse({ startMs: 0, endMs: 100 }));
    const all = await service.addSegment(owner, parent.id, createSegmentDto.parse({ startMs: 200 })); const a = all[0]!; const b = all[1]!;
    expect((await service.reorderSegments(owner, parent.id, [b.id, a.id])).map((s) => s.id)).toEqual([b.id, a.id]);
    await expect(service.updateSegment(owner, parent.id, a.id, { endMs: 0, startMs: 10 })).rejects.toMatchObject({ status: 400 });
    expect((await service.get(owner, parent.id)).segments[1]?.startMs).toBe(0);
    await expect(service.addSegment(other, parent.id, createSegmentDto.parse({ startMs: 0 }))).rejects.toMatchObject({ status: 404 });
    await expect(service.reorderSegments(owner, parent.id, [a.id])).rejects.toMatchObject({ status: 400 });
    expect((await service.removeSegment(owner, parent.id, b.id))[0]?.position).toBe(0);
    expect((await service.archive(owner, parent.id)).archivedAt).not.toBeNull();
    expect((await service.restore(owner, parent.id)).archivedAt).toBeNull();
    const foreign = await client.project.create({ data: { ownerId: other, name: 'Foreign' } });
    await expect(service.update(owner, parent.id, { projectId: foreign.id })).rejects.toMatchObject({ status: 404 });
  });
  it('serializes concurrent appends from separate clients and enforces constraints', async () => {
    const parent = await service.create(owner, createDecupageDto.parse({ title: 'Concurrent' }));
    const second = createDatabaseClient(process.env.DATABASE_URL);
    try {
      const otherService = new DecupageService(createDecupageRepository(second));
      await Promise.all([service.addSegment(owner, parent.id, createSegmentDto.parse({ startMs: 0 })), otherService.addSegment(owner, parent.id, createSegmentDto.parse({ startMs: 10 }))]);
      const rows = await client.decupageSegment.findMany({ where: { decupageId: parent.id }, orderBy: { position: 'asc' } });
      expect(rows.map((s) => s.position)).toEqual([0, 1]);
      await expect(client.decupageSegment.create({ data: { decupageId: parent.id, position: 2, startMs: -1 } })).rejects.toThrow();
    } finally { await second.$disconnect(); }
  });
});
