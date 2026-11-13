import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createRecurrenceRepository } from '../../src/infra/database/recurrence-persistence';
import { RecurrenceService } from '../../src/services/recurrence.service';
import { createRuleDto, occurrenceQueryDto } from '../../src/recurrence/dto';
const configured = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
if (process.env.DATABASE_URL || process.env.DIRECT_URL) requireDevelopmentDatabase(process.env);
describe.skipIf(!configured)('task recurrence — real Neon development, no mocks or automatic migrations', () => {
  const owner = randomUUID(); const other = randomUUID();
  let client: ReturnType<typeof createDatabaseClient>;
  let service: RecurrenceService;
  beforeAll(async () => {
    client = createDatabaseClient(process.env.DATABASE_URL);
    service = new RecurrenceService(createRecurrenceRepository(client), () => new Date('2026-11-13T01:00:00Z'));
    await client.user.createMany({ data: [owner, other].map((id) => ({ id, email: `recurrence-${id}@example.invalid`, name: 'Synthetic', passwordHash: 'unusable' })) });
  });
  afterAll(async () => {
    if (!client) return;
    try {
      await client.task.deleteMany({ where: { ownerId: { in: [owner, other] } } });
      await client.user.deleteMany({ where: { id: { in: [owner, other] } } });
    } finally { await client.$disconnect(); }
  });
  it('persists versioned rules, sparse state and completion history, without duplicating tasks or future occurrences', async () => {
    const task = await client.task.create({ data: { ownerId: owner, title: 'Recurring' } });
    const rule = await service.configure(owner, task.id, createRuleDto.parse({ frequency: 'DAILY', startDate: '2026-11-01', count: 30, timezone: 'America/Bahia' }));
    const query = occurrenceQueryDto.parse({ from: '2026-11-01', to: '2026-11-30' });
    expect((await service.occurrences(owner, task.id, query)).items).toHaveLength(30);
    expect(await client.taskOccurrence.count({ where: { ruleId: rule.id } })).toBe(0);
    await service.setCompleted(owner, task.id, rule.id, '2026-11-12', true);
    await service.setCompleted(owner, task.id, rule.id, '2026-11-12', false);
    expect(await client.taskOccurrenceEvent.count({ where: { ruleId: rule.id } })).toBe(2);
    const next = await service.update(owner, task.id, { interval: 2 }); expect(next.version).toBe(2);
    expect((await service.occurrences(owner, task.id, { ...query, ruleId: rule.id })).items).toHaveLength(1);
    await expect(service.get(other, task.id)).rejects.toMatchObject({ status: 404 });
    expect((await client.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('PENDING');
    await client.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });
    expect((await service.get(owner, task.id)).nextOccurrenceDate).toBeNull();
    await expect(service.transition(owner, task.id, 'suspend')).rejects.toMatchObject({ status: 409 });
  });
  it('serializes duplicate completion across clients, with one state row and one history event', async () => {
    const task = await client.task.create({ data: { ownerId: owner, title: 'Concurrent' } });
    const rule = await service.configure(owner, task.id, createRuleDto.parse({ frequency: 'DAILY', startDate: '2026-11-01', timezone: 'UTC' }));
    const second = createDatabaseClient(process.env.DATABASE_URL);
    try {
      const otherService = new RecurrenceService(createRecurrenceRepository(second));
      const results = await Promise.all([service.setCompleted(owner, task.id, rule.id, '2026-11-12', true), otherService.setCompleted(owner, task.id, rule.id, '2026-11-12', true)]);
      expect(results[0]?.completedAt).toBe(results[1]?.completedAt);
      expect(await client.taskOccurrence.count({ where: { ruleId: rule.id } })).toBe(1);
      expect(await client.taskOccurrenceEvent.count({ where: { ruleId: rule.id } })).toBe(1);
    } finally { await second.$disconnect(); }
  });
});
