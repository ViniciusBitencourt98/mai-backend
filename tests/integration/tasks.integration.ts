import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createTaskRepository } from '../../src/infra/database/task-persistence';
import { TaskService } from '../../src/services/task.service';
import { createTaskDto, createSubtaskDto, taskQueryDto } from '../../src/tasks/dto';
const configured = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
if (process.env.DATABASE_URL || process.env.DIRECT_URL) requireDevelopmentDatabase(process.env);
describe.skipIf(!configured)('tasks — real Neon development; no mocks or automatic migrations', () => {
  const owner = randomUUID(); const other = randomUUID();
  let client: ReturnType<typeof createDatabaseClient>;
  let service: TaskService;
  beforeAll(async () => {
    client = createDatabaseClient(process.env.DATABASE_URL);
    service = new TaskService(createTaskRepository(client), () => new Date('2026-11-13T01:00:00Z'));
    await client.user.createMany({ data: [owner, other].map((id) => ({ id, email: `tasks-${id}@example.invalid`, name: 'Synthetic', passwordHash: 'unusable' })) });
  });
  afterAll(async () => {
    if (!client) return;
    try {
      await client.task.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.project.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.user.deleteMany({ where: { id: { in: [owner, other] } } });
    } finally { await client.$disconnect(); }
  });
  it('persists tasks, completion invariants, optional links, deadlines and ordered subtasks', async () => {
    const row = await service.create(owner, createTaskDto.parse({ title: 'Task', dueDate: '2026-11-11', priority: 'HIGH' }));
    expect(row.projectId).toBeNull();
    const foreign = await client.project.create({ data: { ownerId: other, name: 'Foreign' } });
    await expect(service.update(owner, row.id, { projectId: foreign.id })).rejects.toMatchObject({ status: 404 });
    await expect(client.task.update({ where: { id: row.id }, data: { projectId: foreign.id } })).rejects.toMatchObject({ code: 'P2003' });
    const a = (await service.addSubtask(owner, row.id, createSubtaskDto.parse({ title: 'A' })))[0]!;
    const b = (await service.addSubtask(owner, row.id, createSubtaskDto.parse({ title: 'B' })))[1]!;
    expect((await service.reorderSubtasks(owner, row.id, [b.id, a.id])).map((s) => s.id)).toEqual([b.id, a.id]);
    await expect(service.reorderSubtasks(owner, row.id, [a.id])).rejects.toMatchObject({ status: 400 });
    expect((await service.get(owner, row.id)).subtasks.map((s) => s.id)).toEqual([b.id, a.id]);
    expect((await service.list(owner, taskQueryDto.parse({ overdue: 'true', priority: 'HIGH' }), 'America/Bahia')).items.some((s) => s.id === row.id)).toBe(true);
    const completed = await service.complete(owner, row.id);
    expect(completed.completedAt).not.toBeNull(); expect((await service.complete(owner, row.id)).completedAt).toEqual(completed.completedAt);
    expect((await service.get(owner, row.id)).subtasks.every((s) => !s.completed)).toBe(true);
    await expect(service.update(owner, row.id, { status: 'CANCELLED' })).rejects.toMatchObject({ status: 409 });
    expect((await service.reopen(owner, row.id)).completedAt).toBeNull();
    expect((await service.removeSubtask(owner, row.id, b.id)).map((s) => [s.id, s.position])).toEqual([[a.id, 0]]);
    expect((await service.updateSubtask(owner, row.id, a.id, { completed: true }))[0]?.completed).toBe(true);
    await expect(service.removeSubtask(other, row.id, a.id)).rejects.toMatchObject({ status: 404 });
    await service.archive(owner, row.id); expect((await service.get(owner, row.id)).archivedAt).not.toBeNull();
    expect((await service.restore(owner, row.id)).archivedAt).toBeNull();
    await expect(client.task.update({ where: { id: row.id }, data: { status: 'COMPLETED', completedAt: null } })).rejects.toThrow();
  });
  it('serializes concurrent appends and completion from separate clients', async () => {
    const row = await service.create(owner, createTaskDto.parse({ title: 'Concurrent' }));
    const second = createDatabaseClient(process.env.DATABASE_URL);
    try {
      const otherService = new TaskService(createTaskRepository(second));
      await Promise.all([service.addSubtask(owner, row.id, createSubtaskDto.parse({ title: 'A' })), otherService.addSubtask(owner, row.id, createSubtaskDto.parse({ title: 'B' }))]);
      expect((await service.get(owner, row.id)).subtasks.map((s) => s.position)).toEqual([0, 1]);
      const results = await Promise.all([service.complete(owner, row.id), otherService.complete(owner, row.id)]);
      expect(results[0]?.completedAt).toEqual(results[1]?.completedAt);
    } finally { await second.$disconnect(); }
  });
});
