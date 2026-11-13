import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createEventRepository } from '../../src/infra/database/event-persistence';
import { EventService } from '../../src/services/event.service';
import { createEventDto,eventOccurrenceQueryDto,eventQueryDto,occurrencePatchDto } from '../../src/events/dto';
import { createRuleDto } from '../../src/recurrence/dto';
const configured=Boolean(process.env.DATABASE_URL&&process.env.DIRECT_URL);
if(process.env.DATABASE_URL||process.env.DIRECT_URL)requireDevelopmentDatabase(process.env);
describe.skipIf(!configured)('events — real Neon development, no mocks or automatic migrations',()=>{
 const owner=randomUUID(),other=randomUUID();let client:ReturnType<typeof createDatabaseClient>;let service:EventService;
 beforeAll(async()=>{client=createDatabaseClient(process.env.DATABASE_URL);service=new EventService(createEventRepository(client),()=>new Date('2026-03-01T12:00:00Z'));await client.user.createMany({data:[owner,other].map((id)=>({id,email:`events-${id}@example.invalid`,name:'Synthetic',passwordHash:'unusable'}))});});
 afterAll(async()=>{if(!client)return;try{await client.event.deleteMany({where:{ownerId:{in:[owner,other]}}});await client.project.deleteMany({where:{ownerId:{in:[owner,other]}}});await client.user.deleteMany({where:{id:{in:[owner,other]}}});}finally{await client.$disconnect();}});
 it('persists UTC events, overlap filters, versioned rules and moved/cancelled exceptions',async()=>{
  const event=await service.create(owner,createEventDto.parse({title:'Interview',startAt:'2026-03-07T09:00:00-05:00',endAt:'2026-03-07T10:00:00-05:00',timezone:'America/New_York'}));
  expect(event.startAt).toBe('2026-03-07T14:00:00.000Z');
  expect((await service.list(owner,eventQueryDto.parse({from:'2026-03-07T14:30:00Z',to:'2026-03-07T16:00:00Z'}))).items).toHaveLength(1);
  const foreign=await client.project.create({data:{ownerId:other,name:'Foreign'}});await expect(service.update(owner,event.id,{projectId:foreign.id})).rejects.toMatchObject({status:404});
  await expect(client.event.update({where:{id:event.id},data:{projectId:foreign.id}})).rejects.toMatchObject({code:'P2003'});
  const rule=await service.configure(owner,event.id,createRuleDto.parse({frequency:'DAILY',startDate:'2026-03-07',count:3,timezone:'America/New_York'}));
  const q=eventOccurrenceQueryDto.parse({from:'2026-03-01T00:00:00Z',to:'2026-04-01T00:00:00Z'});
  expect((await service.occurrences(owner,event.id,q)).items.map((o)=>o.startAt)).toEqual(['2026-03-07T14:00:00.000Z','2026-03-08T13:00:00.000Z','2026-03-09T13:00:00.000Z']);expect(await client.eventException.count({where:{ruleId:rule.id}})).toBe(0);
  await service.exception(owner,event.id,rule.id,'2026-03-07',occurrencePatchDto.parse({startAt:'2026-04-10T12:00:00Z',endAt:'2026-04-10T13:00:00Z'}));expect((await service.occurrences(owner,event.id,q)).items).toHaveLength(2);
  await expect(service.exception(other,event.id,rule.id,'2026-03-07',null,true)).rejects.toMatchObject({status:404});
  const next=await service.updateRule(owner,event.id,{interval:2});expect(next.version).toBe(2);expect((await service.occurrences(owner,event.id,{...q,ruleId:rule.id})).calculated).toBe(false);
  await expect(client.event.update({where:{id:event.id},data:{endAt:new Date(event.startAt)}})).rejects.toThrow();
 });
 it('serializes concurrent cancellation without duplicate exception rows',async()=>{
  const event=await service.create(owner,createEventDto.parse({title:'Concurrent',startAt:'2026-03-07T14:00:00Z',endAt:'2026-03-07T15:00:00Z',timezone:'UTC'}));const rule=await service.configure(owner,event.id,createRuleDto.parse({frequency:'DAILY',startDate:'2026-03-07',timezone:'UTC'}));const second=createDatabaseClient(process.env.DATABASE_URL);
  try{const otherService=new EventService(createEventRepository(second));await Promise.all([service.exception(owner,event.id,rule.id,'2026-03-07',null,true),otherService.exception(owner,event.id,rule.id,'2026-03-07',null,true)]);expect(await client.eventException.count({where:{ruleId:rule.id}})).toBe(1);expect((await service.exception(owner,event.id,rule.id,'2026-03-07',null,false)).cancelled).toBe(false);}finally{await second.$disconnect();}
 });
});
