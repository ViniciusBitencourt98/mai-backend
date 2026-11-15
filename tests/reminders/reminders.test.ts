import {afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '../../src/generated/prisma/client';
import {withDomainReminders,synchronizeReminders} from '../../src/infra/database/domain-reminders';
import {createPublicationRepository} from '../../src/infra/database/publication-persistence';
import {reminderSettingsDto} from '../../src/services/reminder.service';
const owner=randomUUID(),id=randomUUID(),ruleId=randomUUID();
const now=new Date('2026-11-15T10:00:00Z');
afterEach(()=>vi.useRealTimers());
function fixture(){
 vi.useFakeTimers();vi.setSystemTime(now);
 let state={publication:{id,ownerId:owner,title:'Film',scheduledAt:new Date('2026-11-15T12:00:00Z'),status:'PLANNED',archivedAt:null,updatedAt:now},rows:[] as Record<string,unknown>[],logs:[] as unknown[]};
 const rule={id:ruleId,ownerId:owner,sourceType:'PUBLICATION',sourceId:id,leadMinutes:60,enabled:true,version:1};
 const preferences={timezone:'UTC',emailEnabled:true,dailyDigestEnabled:false,dailyDigestTime:'08:00'};
 const tx={
  $queryRaw:vi.fn(async()=>[{id:owner}]),
  publication:{findFirst:vi.fn(async()=>state.publication),updateManyAndReturn:vi.fn(async({data}:{data:object})=>{Object.assign(state.publication,data,{updatedAt:new Date()});return [state.publication];})},
  userPreferences:{findUnique:vi.fn(async()=>preferences)},
  reminderRule:{findUnique:vi.fn(async()=>rule),findFirst:vi.fn(async()=>rule)},
  notificationOutbox:{findMany:vi.fn(async()=>state.rows.filter(r=>['PENDING','RESERVED','PUBLISHED'].includes(r.status as string))),findUnique:vi.fn(async({where}:{where:{ownerId_idempotencyKey:{idempotencyKey:string}}})=>state.rows.find(r=>r.idempotencyKey===where.ownerId_idempotencyKey.idempotencyKey)??null),
   findFirst:vi.fn(async({where}:{where:{id:string;ownerId:string}})=>state.rows.find(r=>r.id===where.id&&r.ownerId===where.ownerId)??null),count:vi.fn(async()=>state.rows.filter(r=>r.status==='PENDING').length),
   create:vi.fn(async({data}:{data:object})=>{const row={...data,id:randomUUID(),status:'PENDING',leaseToken:null,leaseUntil:null,reservedFrom:null,attemptCount:0};state.rows.push(row);return row;}),
   updateManyAndReturn:vi.fn(async({where,data}:{where:{id:string};data:object})=>{const row=state.rows.find(r=>r.id===where.id);if(!row)return [];Object.assign(row,data);return [row];})},
  notificationDeliveryLog:{create:vi.fn(async({data}:{data:unknown})=>{state.logs.push(data);return data;})},
 };
 const transaction=vi.fn(async(fn:(t:typeof tx)=>Promise<unknown>)=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}});
 const client={...tx,$transaction:transaction} as unknown as PrismaClient;
 const repository=withDomainReminders(client,createPublicationRepository,'PUBLICATION',['update']);
 return {tx,client,repository,rule,preferences,state:()=>state,transaction};
}
it('publication reschedule creates, invalidates and replaces intentions in the same transaction; repeat sync is idempotent',async()=>{
 const app=fixture();await app.repository.update(owner,id,{scheduledAt:new Date('2026-11-15T13:00:00Z')});
 expect(app.state().rows).toHaveLength(1);expect(app.state().rows[0]).toMatchObject({scheduledAt:new Date('2026-11-15T12:00:00Z'),status:'PENDING'});
 await synchronizeReminders(app.tx as never,owner,{sourceType:'PUBLICATION',sourceId:id},now);expect(app.state().rows).toHaveLength(1);
 vi.setSystemTime(new Date('2026-11-15T10:01:00Z'));await app.repository.update(owner,id,{scheduledAt:new Date('2026-11-15T14:00:00Z')});
 expect(app.state().rows.map(r=>r.status)).toEqual(['CANCELLED','PENDING']);expect(app.transaction).toHaveBeenCalledTimes(2);
 expect(app.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(app.tx.publication.updateManyAndReturn.mock.invocationCallOrder[0]!);
});
it.each([{status:'CANCELLED'},{status:'PUBLISHED'},{scheduledAt:null},{archivedAt:now}])('invalidates publication when ineligible %j',async patch=>{
 const app=fixture();await app.repository.update(owner,id,{});vi.setSystemTime(new Date('2026-11-15T10:01:00Z'));await app.repository.update(owner,id,patch as never);
 expect(app.state().rows).toHaveLength(1);expect(app.state().rows[0]?.status).toBe('CANCELLED');
});
it('rolls simulated domain changes back when an outbox/audit write fails; does not swallow the failure',async()=>{
 const app=fixture();app.tx.notificationDeliveryLog.create.mockRejectedValueOnce(new Error('Audit unavailable'));
 await expect(app.repository.update(owner,id,{title:'Changed'})).rejects.toThrow('Audit unavailable');
 expect(app.state().publication.title).toBe('Film');expect(app.state().rows).toEqual([]);
});
it('emailEnabled alone gates individual reminders; dailyDigestEnabled never substitutes for it',async()=>{
 const app=fixture();app.preferences.emailEnabled=false;app.preferences.dailyDigestEnabled=true;await app.repository.update(owner,id,{});expect(app.state().rows).toEqual([]);
 app.preferences.emailEnabled=true;app.preferences.dailyDigestEnabled=false;await app.repository.update(owner,id,{});expect(app.state().rows).toHaveLength(1);
});
it('disabled rules, out-of-window times and missing rules generate no new intention',async()=>{
 const app=fixture();app.rule.enabled=false;await app.repository.update(owner,id,{});expect(app.state().rows).toEqual([]);
 app.rule.enabled=true;await app.repository.update(owner,id,{scheduledAt:new Date('2027-01-01')});expect(app.state().rows).toEqual([]);
 app.tx.reminderRule.findUnique.mockResolvedValue(null as never);await app.repository.update(owner,id,{});expect(app.state().rows).toEqual([]);
});
it('keeps native repository transaction callbacks in the outer transaction without nested commits',async()=>{
 const app=fixture();const factory=(client:PrismaClient)=>({mutate:(owner:string,source:string)=>client.$transaction(async()=>({id:source,owner}))});
 await withDomainReminders(app.client,factory,'PUBLICATION',['mutate']).mutate(owner,id);expect(app.transaction).toHaveBeenCalledTimes(1);
});
it('rejects invalid reminder configuration and caller-controlled ownership fields',()=>{
 for(const body of [{},{leadMinutes:-1,enabled:true},{leadMinutes:43201,enabled:true},{leadMinutes:1,enabled:'true'},{leadMinutes:1,enabled:true,ownerId:owner}])expect(reminderSettingsDto.safeParse(body).success).toBe(false);
 expect(reminderSettingsDto.parse({leadMinutes:0,enabled:false})).toEqual({leadMinutes:0,enabled:false});
});
it('task completion/reopen and recurring occurrence state/suspend/resume reconcile only eligible dated occurrences',async()=>{
 const app=fixture();app.rule.sourceType='TASK';app.rule.leadMinutes=0;
 const recurrence={id:randomUUID(),version:1,state:'ACTIVE',frequency:'DAILY',interval:1,startDate:new Date('2026-11-16'),endDate:null,count:3,weekdays:[],timezone:'UTC',updatedAt:now};
 const task={dueDate:null,status:'PENDING',archivedAt:null,updatedAt:now,recurrenceRules:[recurrence]};let done=false;
 Object.assign(app.tx,{task:{findFirst:vi.fn(async()=>task)},taskRecurrence:{findFirst:vi.fn(async()=>recurrence)},taskOccurrence:{findUnique:vi.fn(async({where}:{where:{ruleId_date:{date:Date}}})=>done&&where.ruleId_date.date.toISOString().startsWith('2026-11-17')?{completedAt:now,updatedAt:now}:null)}});
 const sync=()=>synchronizeReminders(app.tx as never,owner,{sourceType:'TASK',sourceId:id},now);
 await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(3);
 done=true;await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(2);
 recurrence.state='PAUSED';await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(0);
 recurrence.state='ACTIVE';recurrence.updatedAt=new Date(now.getTime()+1000);await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(2);
 task.archivedAt=now as never;await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(0);
});
it('planning includes a moved event exception with original date outside the civil window and cancels it when overridden',async()=>{
 const app=fixture();app.rule.sourceType='EVENT';app.rule.leadMinutes=0;
 const recurrence={id:randomUUID(),version:1,state:'ACTIVE',frequency:'DAILY',interval:1,startDate:new Date('2026-11-01'),endDate:null,count:1,weekdays:[],timezone:'UTC',updatedAt:now,anchorStartAt:new Date('2026-11-01T12:00:00Z')};
 const override={date:new Date('2026-11-01'),startAt:new Date('2026-11-16T12:00:00Z'),cancelled:false,updatedAt:now};
 Object.assign(app.tx,{event:{findFirst:vi.fn(async()=>({archivedAt:null,updatedAt:now,recurrenceRules:[recurrence]}))},eventRecurrence:{findFirst:vi.fn(async()=>recurrence)},eventException:{findMany:vi.fn(async()=>[override]),findUnique:vi.fn(async()=>override)}});
 const sync=()=>synchronizeReminders(app.tx as never,owner,{sourceType:'EVENT',sourceId:id},now);
 await sync();expect(app.state().rows[0]).toMatchObject({occurrenceDate:new Date('2026-11-01'),scheduledAt:override.startAt,status:'PENDING'});
 override.cancelled=true;await sync();expect(app.state().rows[0]?.status).toBe('CANCELLED');
});
it('one-off task deadline uses user timezone and completion/reopening replaces only eligible reminders',async()=>{
 const app=fixture();app.rule.sourceType='TASK';app.rule.leadMinutes=0;
 app.preferences.timezone='America/Bahia';
 const task={dueDate:new Date('2026-11-16'),status:'PENDING',archivedAt:null,updatedAt:now,recurrenceRules:[]};
 Object.assign(app.tx,{task:{findFirst:vi.fn(async()=>task)},taskRecurrence:{findFirst:vi.fn(async()=>null)}});
 const sync=()=>synchronizeReminders(app.tx as never,owner,{sourceType:'TASK',sourceId:id},now);
 await sync();expect(app.state().rows[0]?.scheduledAt).toEqual(new Date('2026-11-16T12:00:00Z'));
 task.status='COMPLETED';task.updatedAt=new Date(now.getTime()+1000);await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(0);
 task.status='PENDING';task.updatedAt=new Date(now.getTime()+2000);await sync();expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(1);
});

it('renews a recurring horizon as time advances without domain writes or duplicate intentions',async()=>{
 const app=fixture();app.rule.sourceType='TASK';app.rule.leadMinutes=0;
 const recurrence={id:randomUUID(),version:1,state:'ACTIVE',frequency:'DAILY',interval:1,startDate:new Date('2026-11-16'),endDate:null,count:90,weekdays:[],timezone:'UTC',updatedAt:now};
 const task={dueDate:null,status:'PENDING',archivedAt:null,updatedAt:now,recurrenceRules:[recurrence]};
 Object.assign(app.tx,{task:{findFirst:vi.fn(async()=>task)},taskRecurrence:{findFirst:vi.fn(async()=>recurrence)},taskOccurrence:{findUnique:vi.fn(async()=>null)}});
 const ref={sourceType:'TASK' as const,sourceId:id};
 await synchronizeReminders(app.tx as never,owner,ref,now);
 expect(app.state().rows.some(r=>(r.occurrenceDate as Date).toISOString().startsWith('2026-12-20'))).toBe(false);
 const later=new Date('2026-12-01T10:00:00Z');vi.setSystemTime(later);
 await synchronizeReminders(app.tx as never,owner,ref,later);
 expect(app.state().rows.some(r=>(r.occurrenceDate as Date).toISOString().startsWith('2026-12-20')&&r.status==='PENDING')).toBe(true);
 const size=app.state().rows.length;await synchronizeReminders(app.tx as never,owner,ref,later);expect(app.state().rows).toHaveLength(size);
 expect(task.updatedAt).toEqual(now);expect(recurrence.version).toBe(1);
 recurrence.state='ENDED';await synchronizeReminders(app.tx as never,owner,ref,later);expect(app.state().rows.filter(r=>r.status==='PENDING')).toHaveLength(0);
});
