import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { createEventRepository } from '../../src/infra/database/event-persistence';
import { createRecurrenceRepository } from '../../src/infra/database/recurrence-persistence';
import { createTaskRepository } from '../../src/infra/database/task-persistence';
import { createRuleDto } from '../../src/recurrence/dto';
import { RecurrenceService } from '../../src/services/recurrence.service';
import { EventService } from '../../src/services/event.service';
import { TaskService } from '../../src/services/task.service';

const now = new Date('2026-03-01T12:00:00Z');
const input = createRuleDto.parse({ frequency: 'DAILY', startDate: '2026-03-01', count: 3, timezone: 'UTC' });
const storedRule = { ...input, id: 'rule', version: 1, state: 'ACTIVE', createdAt: now, updatedAt: now,
  startDate: new Date('2026-03-01T00:00:00Z'), endDate: null };

describe('Phase 3 transaction failure propagation — isolated Prisma mocks, not PostgreSQL rollback proof', () => {
  it('awaits the occurrence audit write inside the transaction and propagates its failure', async () => {
    const failure = new Error('Injected audit failure');
    const tx = {
      task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue({ archivedAt: null }) },
      taskRecurrence: { findMany: vi.fn().mockResolvedValue([{ ...storedRule, taskId: 'task' }]) },
      taskOccurrence: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) },
      taskOccurrenceEvent: { create: vi.fn().mockRejectedValue(failure) },
    };
    const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    const service = new RecurrenceService(createRecurrenceRepository({ $transaction: transaction } as unknown as PrismaClient), () => now);
    await expect(service.setCompleted('A', 'task', 'rule', '2026-03-01', true)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000, maxWait: 10000 });
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { id: 'task', ownerId: 'A' }, data: { updatedAt: expect.any(Date) } });
    expect(tx.taskOccurrence.upsert).toHaveBeenCalledTimes(1);
    expect(tx.taskOccurrenceEvent.create).toHaveBeenCalledTimes(1);
  });

  it.each(['version', 'exception'])('propagates a failed event %s write through the locked transaction', async (stage) => {
    const failure = new Error('Injected event write failure');
    const tx = {
      event: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue({
        id: 'event', ownerId: 'A', title: 'Interview', description: null, location: null, projectId: null, timezone: 'UTC',
        startAt: now, endAt: new Date(now.getTime() + 3600000), createdAt: now, updatedAt: now, archivedAt: null,
      }) },
      eventRecurrence: { findMany: vi.fn().mockResolvedValue([{ ...storedRule, eventId: 'event', anchorStartAt: now, anchorEndAt: new Date(now.getTime() + 3600000) }]),
        create: vi.fn().mockRejectedValue(failure) },
      eventException: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockRejectedValue(failure) },
    };
    const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    const service = new EventService(createEventRepository({ $transaction: transaction } as unknown as PrismaClient), () => now);
    const operation = stage === 'version' ? service.updateRule('A', 'event', { interval: 2 }) : service.exception('A', 'event', 'rule', '2026-03-01', null, true);
    await expect(operation).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.event.updateMany).toHaveBeenCalledWith({ where: { id: 'event', ownerId: 'A' }, data: { updatedAt: expect.any(Date) } });
    expect(stage === 'version' ? tx.eventRecurrence.create : tx.eventException.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not return success or continue subtasks writes after a failed reorder update', async () => {
    const failure = new Error('Injected position write failure');
    const subtasks = ['first', 'second'].map((id, position) => ({ id, taskId: 'task', title: id, completed: false, position, createdAt: now, updatedAt: now }));
    const tx = {
      task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      subtask: { findMany: vi.fn().mockResolvedValue(subtasks), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), updateMany: vi.fn().mockRejectedValue(failure) },
    };
    const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    const service = new TaskService(createTaskRepository({ $transaction: transaction } as unknown as PrismaClient), () => now);
    await expect(service.reorderSubtasks('A', 'task', ['second', 'first'])).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.subtask.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'task', id: { notIn: ['second', 'first'] } } });
    expect(tx.subtask.updateMany).toHaveBeenCalledTimes(1);
  });
});
