import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client';
import { createNotificationRepository, createNotificationTransactionRepository } from '../../src/infra/database/notification-persistence';
import { notificationSource } from '../../src/infra/database/notification-source';
import { notificationQueryDto, type IntentData } from '../../src/notifications/dto';
const owner = randomUUID(), sourceId = randomUUID(), id = randomUUID(), ruleId = randomUUID();
const at = new Date('2026-11-15T12:00:00Z');
const preferences = { timezone: 'America/Bahia', emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: '08:00' };
function mocks() {
  const row = { id, ownerId: owner, status: 'PENDING', reminderRuleId: null, leaseToken: null, occurrenceDate: null, providerMessageId: null };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: owner }]),
    userPreferences: { findUnique: vi.fn().mockResolvedValue(preferences) },
    reminderRule: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: ruleId, ownerId: owner }) },
    notificationOutbox: { findFirst: vi.fn().mockResolvedValue(row), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(row), count: vi.fn().mockResolvedValue(0), updateManyAndReturn: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    notificationDeliveryLog: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]) },
  };
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  const client = { ...tx, $transaction: transaction } as unknown as PrismaClient;
  return { tx, transaction, repository: createNotificationRepository(client), row };
}
const data: IntentData = { type: 'DAILY_DIGEST', sourceType: null, sourceId: null, reminderRuleId: null, ruleVersion: null, sourceVersion: 'a'.repeat(64), recurrenceRuleId: null, recurrenceVersion: null, occurrenceDate: null, digestDate: at, timezone: 'UTC', scheduledAt: at, idempotencyKey: 'b'.repeat(64) };
it('inserts intent and audit in the same transaction; duplicate identity returns original before new-window validation', async () => {
  const app = mocks(), validate = vi.fn();
  await app.repository.enqueue(owner, null, () => data, validate);
  expect(app.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000, maxWait: 10000 });
  expect(app.tx.notificationOutbox.findUnique).toHaveBeenCalledWith({ where: { ownerId_idempotencyKey: { ownerId: owner, idempotencyKey: data.idempotencyKey } } });
  expect(app.tx.notificationOutbox.create).toHaveBeenCalledWith({ data: { ...data, ownerId: owner } });
  expect(app.tx.notificationDeliveryLog.create).toHaveBeenCalledWith({ data: { ownerId: owner, outboxId: id, status: 'PENDING', result: 'CREATED' } });
  expect(app.tx.notificationOutbox.create.mock.invocationCallOrder[0]).toBeLessThan(app.tx.notificationDeliveryLog.create.mock.invocationCallOrder[0]!);
  app.tx.notificationOutbox.findUnique.mockResolvedValue(app.row); validate.mockClear();
  expect(await app.repository.enqueue(owner, null, () => data, validate)).toEqual(app.row); expect(validate).not.toHaveBeenCalled(); expect(app.tx.notificationOutbox.create).toHaveBeenCalledTimes(1);
});
it('limits active records and propagates audit failure without claiming simulated rollback as PostgreSQL proof', async () => {
  const app=mocks();app.tx.notificationOutbox.count.mockResolvedValue(1000);
  await expect(app.repository.enqueue(owner,null,()=>data,()=>{})).rejects.toMatchObject({status:409,code:'NOTIFICATION_LIMIT'});expect(app.tx.notificationOutbox.create).not.toHaveBeenCalled();
  app.tx.notificationOutbox.count.mockResolvedValue(0);const failure=new Error('Log insert failed');app.tx.notificationDeliveryLog.create.mockRejectedValue(failure);
  await expect(app.repository.enqueue(owner,null,()=>data,()=>{})).rejects.toBe(failure);
});
it('scopes all reads and history by owner, uses bounded queries, and supports joining an existing transaction',async()=>{
  const app=mocks(),q=notificationQueryDto.parse({page:'2',limit:'5',status:'FAILED'});
  await app.repository.get(owner,id);expect(app.tx.notificationOutbox.findFirst).toHaveBeenLastCalledWith({where:{id,ownerId:owner}});
  await app.repository.list(owner,q);expect(app.tx.notificationOutbox.findMany).toHaveBeenCalledWith({where:{ownerId:owner,status:'FAILED'},orderBy:[{scheduledAt:'asc'},{id:'asc'}],skip:5,take:6});
  await app.repository.history(owner,id,q);expect(app.tx.notificationDeliveryLog.findMany).toHaveBeenCalledWith({where:{ownerId:owner,outboxId:id,status:'FAILED'},orderBy:[{attemptedAt:'asc'},{id:'asc'}],skip:5,take:6});
  app.tx.notificationOutbox.findFirst.mockResolvedValue(null);await expect(app.repository.history('other',id,q)).rejects.toMatchObject({status:404});
  await createNotificationTransactionRepository(app.tx as unknown as Prisma.TransactionClient).enqueue(owner,null,()=>data,()=>{});expect(app.transaction).not.toHaveBeenCalled();
});
it('rejects inactive/foreign resources and applies compare-and-set state plus audit atomically',async()=>{
  const app=mocks();app.tx.$queryRaw.mockResolvedValueOnce([]);
  await expect(app.repository.enqueue(owner,null,()=>data,()=>{})).rejects.toMatchObject({status:401});
  app.tx.notificationOutbox.findFirst.mockResolvedValueOnce(null);await expect(app.repository.mutate('other',id,()=>null)).rejects.toMatchObject({status:404});
  app.tx.notificationOutbox.updateManyAndReturn.mockResolvedValue([{...app.row,status:'CANCELLED'}]);
  await app.repository.mutate(owner,id,()=>({patch:{status:'CANCELLED',cancelledAt:at},result:'CANCELLED',at,error:'STALE'}));
  expect(app.tx.notificationOutbox.updateManyAndReturn).toHaveBeenCalledWith({where:{id,ownerId:owner,status:'PENDING',leaseToken:null},data:{status:'CANCELLED',cancelledAt:at}});
  expect(app.tx.notificationDeliveryLog.create).toHaveBeenLastCalledWith({data:{ownerId:owner,outboxId:id,status:'CANCELLED',attemptedAt:at,result:'CANCELLED',errorCategory:'STALE',providerMessageId:null}});
  app.tx.notificationOutbox.updateManyAndReturn.mockResolvedValue([]);await expect(app.repository.mutate(owner,id,()=>({patch:{status:'CANCELLED'},result:'CANCELLED',at}))).rejects.toMatchObject({status:409});
});
it('upserts a scoped rule, bumps versions only on real change and cancels live rows with bounded logs',async()=>{
  const app=mocks();app.tx.notificationOutbox.updateManyAndReturn.mockResolvedValue([{id}]);
  const input={sourceType:'TASK' as const,sourceId,leadMinutes:60,enabled:false};await app.repository.configure(owner,input);
  expect(app.tx.reminderRule.upsert).toHaveBeenCalledWith({where:{ownerId_sourceType_sourceId:{ownerId:owner,sourceType:'TASK',sourceId}},create:{...input,ownerId:owner},update:{leadMinutes:60,enabled:false,version:{increment:1}}});
  expect(app.tx.notificationOutbox.updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({where:{ownerId:owner,reminderRuleId:ruleId,status:{in:['PENDING','RESERVED','PUBLISHED']}},data:expect.objectContaining({status:'CANCELLED',lastError:'STALE',leaseToken:null})}));
  expect(app.tx.notificationDeliveryLog.createMany).toHaveBeenCalledWith({data:[{ownerId:owner,outboxId:id,status:'CANCELLED',result:'CANCELLED',errorCategory:'STALE'}]});
  app.tx.reminderRule.findUnique.mockResolvedValue({id:ruleId,...input});await app.repository.configure(owner,input);expect(app.tx.reminderRule.upsert).toHaveBeenCalledTimes(1);
});
describe('source resolution — existing civil engine, isolated Prisma',()=>{
  function sourceTx(){return {$queryRaw:vi.fn().mockResolvedValue([{id:sourceId}]),task:{findFirst:vi.fn()},event:{findFirst:vi.fn()},publication:{findFirst:vi.fn()},taskOccurrence:{findUnique:vi.fn().mockResolvedValue(null)},eventException:{findUnique:vi.fn().mockResolvedValue(null)}};}
  const rule={id:ruleId,version:3,state:'ACTIVE',frequency:'DAILY',interval:1,startDate:new Date('2026-11-01'),endDate:null,count:30,weekdays:[],timezone:'America/New_York',updatedAt:at,anchorStartAt:new Date('2026-11-01T05:30:00Z')};
  it('anchors dated tasks at their own due civil day 09:00, omits completed/undated and scopes owners',async()=>{
    const tx=sourceTx();tx.task.findFirst.mockResolvedValue({dueDate:new Date('2026-11-15'),status:'PENDING',archivedAt:null,updatedAt:at,recurrenceRules:[]});
    const result=await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'TASK',sourceId},preferences);
    expect(result?.at.toISOString()).toBe('2026-11-15T12:00:00.000Z');expect(tx.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:sourceId,ownerId:owner}}));
    tx.task.findFirst.mockResolvedValue({dueDate:null,status:'PENDING',archivedAt:null,updatedAt:at,recurrenceRules:[]});expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'TASK',sourceId},preferences)).toBeNull();
    tx.$queryRaw.mockResolvedValue([]);expect(await notificationSource(tx as unknown as Prisma.TransactionClient,'other',{sourceType:'TASK',sourceId},preferences)).toBeNull();
  });
  it('pins current recurrence identity/version, skips completed/future-invalid dates and paused rules',async()=>{
    const tx=sourceTx();const row={dueDate:null,status:'COMPLETED',archivedAt:null,updatedAt:at,recurrenceRules:[rule]};tx.task.findFirst.mockResolvedValue(row);
    expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'TASK',sourceId},preferences,'2026-11-01')).toMatchObject({recurrenceRuleId:ruleId,recurrenceVersion:3,timezone:'America/New_York'});
    tx.taskOccurrence.findUnique.mockResolvedValue({completedAt:at});expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'TASK',sourceId},preferences,'2026-11-01')).toBeNull();
    tx.taskOccurrence.findUnique.mockResolvedValue(null);expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'TASK',sourceId},preferences,'2027-01-01')).toBeNull();
    tx.task.findFirst.mockResolvedValue({...row,recurrenceRules:[{...rule,state:'PAUSED'}]});expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'TASK',sourceId},preferences,'2026-11-01')).toBeNull();
  });
  it('uses event override start, cancellation and DST fold identity without generating a persistent series',async()=>{
    const tx=sourceTx();tx.event.findFirst.mockResolvedValue({archivedAt:null,updatedAt:at,recurrenceRules:[rule]});
    const initial=await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'EVENT',sourceId},preferences,'2026-11-01');expect(initial?.at.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    tx.eventException.findUnique.mockResolvedValue({startAt:new Date('2026-11-20T12:00:00Z'),cancelled:false,updatedAt:new Date('2026-11-16')});
    const moved=await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'EVENT',sourceId},preferences,'2026-11-01');expect(moved?.at.toISOString()).toBe('2026-11-20T12:00:00.000Z');expect(moved?.occurrenceDate?.toISOString().slice(0,10)).toBe('2026-11-01');expect(moved?.version).not.toBe(initial?.version);
    tx.eventException.findUnique.mockResolvedValue({cancelled:true});expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'EVENT',sourceId},preferences,'2026-11-01')).toBeNull();
    tx.event.findFirst.mockResolvedValue({archivedAt:null,updatedAt:at,recurrenceRules:[{...rule,startDate:new Date('2026-03-08'),anchorStartAt:new Date('2026-03-07T07:30:00Z')}]});
    tx.eventException.findUnique.mockResolvedValue({startAt:new Date('2026-03-09T12:00:00Z'),cancelled:false});
    expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'EVENT',sourceId},preferences,'2026-03-08')).toBeNull();
  });
  it('uses scheduledAt only and omits archived/cancelled/published publications',async()=>{
    const tx=sourceTx();const row={scheduledAt:at,status:'PLANNED',archivedAt:null,updatedAt:at};tx.publication.findFirst.mockResolvedValue(row);
    expect((await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'PUBLICATION',sourceId},preferences))?.at).toEqual(at);
    for(const patch of [{status:'CANCELLED'},{status:'PUBLISHED'},{scheduledAt:null},{archivedAt:at}]){tx.publication.findFirst.mockResolvedValue({...row,...patch});expect(await notificationSource(tx as unknown as Prisma.TransactionClient,owner,{sourceType:'PUBLICATION',sourceId},preferences)).toBeNull();}
  });
});
