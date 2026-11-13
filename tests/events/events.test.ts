import { createServer,type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken,digest,newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { EventService } from '../../src/services/event.service';
import type { EventRepository } from '../../src/repositories/event.repository';
import { createEventDto,patchEventDto,eventQueryDto,eventOccurrenceQueryDto,patchEventRuleDto,occurrencePatchDto,type EventRecord,type EventSnapshot } from '../../src/events/dto';
import { createRuleDto } from '../../src/recurrence/dto';
import { localStamp,resolveLocal } from '../../src/events/time';
import { HttpError } from '../../src/errors/http-error';
import { createEventRepository } from '../../src/infra/database/event-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';
const input=(extra={})=>createEventDto.parse({title:'Interview',startAt:'2026-03-07T14:00:00Z',endAt:'2026-03-07T15:00:00Z',timezone:'America/New_York',...extra});
const rule=(extra={})=>createRuleDto.parse({frequency:'DAILY',startDate:'2026-03-07',timezone:'America/New_York',count:3,...extra});
const query=(extra={})=>eventOccurrenceQueryDto.parse({from:'2026-03-01T00:00:00Z',to:'2026-04-01T00:00:00Z',...extra});
function fake(){
 const snapshots=new Map<string,EventSnapshot>();const projects=new Map<string,string>();const now=new Date('2026-03-01T12:00:00Z');
 const repository:EventRepository={
  async create(ownerId,data){const event={...data,id:randomUUID(),ownerId,archivedAt:null,createdAt:now,updatedAt:now};snapshots.set(event.id,{event,rules:[],exceptions:[]});return event;},
  async ownsProject(ownerId,id){return projects.get(id)===ownerId;},
  async read(ownerId,id){const snapshot=snapshots.get(id);if(snapshot?.event.ownerId!==ownerId)throw new HttpError(404,'NOT_FOUND','Event not found');return structuredClone(snapshot);},
  async mutate(ownerId,id,operation){const before=await repository.read(ownerId,id);const {change,result}=operation(before);
   if(change.event)before.event={...before.event,...change.event,updatedAt:now};
   if(change.rule){const index=before.rules.findIndex((r)=>r.id===change.rule!.id);if(index<0)before.rules.push(change.rule);else before.rules[index]=change.rule;before.rules.sort((a,b)=>b.version-a.version);}
   if(change.exception){const index=before.exceptions.findIndex((e)=>e.ruleId===change.exception!.ruleId&&e.date===change.exception!.date);if(index<0)before.exceptions.push(change.exception);else before.exceptions[index]=change.exception;}
   snapshots.set(id,before);return result;
  },
  async list(ownerId,q){return [...snapshots.values()].map((s)=>s.event).filter((e)=>e.ownerId===ownerId&&(q.includeArchived||!e.archivedAt)&&(!q.projectId||e.projectId===q.projectId)&&(!q.q||e.title.toLowerCase().includes(q.q.toLowerCase()))&&(!q.from||e.endAt>q.from)&&(!q.to||e.startAt<q.to)).sort((a,b)=>(a[q.sort].getTime()-b[q.sort].getTime())*(q.order==='asc'?1:-1)||a.id.localeCompare(b.id)).slice((q.page-1)*q.limit,q.page*q.limit+1);}
 };
 return {repository,snapshots,projects,service:new EventService(repository,()=>now)};
}
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>{server.close(()=>resolve());server.closeAllConnections();})));});
async function setup(){
 const ownerId=randomUUID(),data=fake(),token=newSessionToken();const auth=authRepositoryFake({id:ownerId,name:'Synthetic',email:'test@example.invalid',passwordHash:'unused',disabledAt:null,preferences:{timezone:'America/Bahia',emailEnabled:false}});
 await auth.repository.issueSession({userId:ownerId,tokenHash:digest(token),expiresAt:new Date(Date.now()+60000),now:new Date()});
 const settings=authSettings({AUTH_PUBLIC_ORIGIN:'https://api.example.invalid',CORS_ALLOWED_ORIGIN:'https://app.example.invalid'});
 const app=createApp('',{services:{auth:{settings,run:(fn)=>fn(new AuthService(auth.repository))},events:{run:(fn)=>fn(data.service)},withTechnicalProbes:async()=>{throw new Error('Unused');}}});
 const server=createServer(app);servers.push(server);await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
 const headers={Cookie:settings.cookieName+'='+token,Origin:'https://app.example.invalid','X-CSRF-Token':csrfToken(token),'Content-Type':'application/json'};
 const request=(path='',method='GET',body?:unknown,custom=headers)=>fetch(`http://127.0.0.1:${address.port}/events${path}`,{method,headers:custom,...(body===undefined?{}:{body:JSON.stringify(body)})});return {...data,ownerId,headers,request};
}
describe('event validation and timezone resolution',()=>{
 it.each([{title:''},{title:' '},{title:'x'.repeat(201)},{timezone:'Invalid/Zone'},{startAt:'2026-03-07T09:00:00'},{endAt:'bad'},{ownerId:randomUUID()},{location:3},{projectId:'bad'}])('rejects invalid DTO %j',patch=>{expect(createEventDto.safeParse({...input(),startAt:'2026-03-07T14:00:00Z',endAt:'2026-03-07T15:00:00Z',...patch}).success).toBe(false);});
 it('rejects empty patches, query limits/intervals and occurrence windows over 366 days',()=>{
  expect(patchEventDto.safeParse({}).success).toBe(false);expect(occurrencePatchDto.safeParse({}).success).toBe(false);
  expect(eventQueryDto.safeParse({limit:'101'}).success).toBe(false);expect(eventQueryDto.safeParse({from:'2026-04-01T00:00:00Z',to:'2026-03-01T00:00:00Z'}).success).toBe(false);
  expect(eventOccurrenceQueryDto.safeParse({from:'2026-01-01T00:00:00Z',to:'2028-01-01T00:00:00Z'}).success).toBe(false);
 });
 it('omits DST gaps and chooses the earlier fold instant',()=>{
  expect(resolveLocal('2026-03-08T02:30:00.000','America/New_York')).toBeNull();
  expect(resolveLocal('2026-11-01T01:30:00.000','America/New_York')?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  expect(localStamp(new Date('2026-03-08T13:00:00Z'),'America/New_York')).toBe('2026-03-08T09:00:00.000');
  expect(resolveLocal('2026-10-04T02:15:00.000','Australia/Lord_Howe')).toBeNull();
  expect(resolveLocal('2026-04-05T01:45:00.000','Australia/Lord_Howe')?.toISOString()).toBe('2026-04-04T14:45:00.000Z');
 });
});
describe('event service — isolated persistence',()=>{
 it('creates independent events, validates merged instants, links/detaches own projects and archives',async()=>{
  const app=fake(),projectId=randomUUID();app.projects.set(projectId,'owner');const row=await app.service.create('owner',input());expect(row.projectId).toBeNull();
  await expect(app.service.create('owner',input({endAt:'2026-03-07T14:00:00Z'}))).rejects.toMatchObject({status:400});
  await expect(app.service.create('owner',input({endAt:'2026-06-01T00:00:00Z'}))).rejects.toMatchObject({status:400});
  await expect(app.service.update('owner',row.id,patchEventDto.parse({startAt:'2026-03-08T14:00:00Z'}))).rejects.toMatchObject({status:400});
  expect((await app.service.update('owner',row.id,{projectId,description:'Text',location:'Studio'})).projectId).toBe(projectId);
  expect((await app.service.update('owner',row.id,{projectId:null,description:null,location:null})).projectId).toBeNull();
  const foreign=randomUUID();app.projects.set(foreign,'other');for(const id of [foreign,randomUUID()])await expect(app.service.create('owner',input({projectId:id}))).rejects.toMatchObject({status:404});
  const archive=await app.service.archive('owner',row.id,true);
  expect((await app.service.list('owner',eventQueryDto.parse({}))).items).toHaveLength(0);
  expect((await app.service.list('owner',eventQueryDto.parse({includeArchived:'true'}))).items).toHaveLength(1);expect((await app.service.archive('owner',row.id,true)).archivedAt).toBe(archive.archivedAt);expect((await app.service.archive('owner',row.id,false)).archivedAt).toBeNull();
 });
 it('filters half-open overlaps including events spanning both boundaries, and paginates chronologically',async()=>{
  const app=fake();for(const [title,startAt,endAt]of [['Through','2026-03-01T00:00:00Z','2026-03-04T00:00:00Z'],['Before','2026-03-01T00:00:00Z','2026-03-02T00:00:00Z'],['Inside','2026-03-02T12:00:00Z','2026-03-02T13:00:00Z'],['After','2026-03-03T00:00:00Z','2026-03-04T00:00:00Z']])await app.service.create('owner',input({title,startAt,endAt}));
  await app.service.create('other',input());const q=eventQueryDto.parse({from:'2026-03-02T00:00:00Z',to:'2026-03-03T00:00:00Z',limit:'1'});
  const page=await app.service.list('owner',q);expect(page.items[0]?.title).toBe('Through');expect(page.page.hasMore).toBe(true);
  expect((await app.service.list('owner',{...q,page:2})).items[0]?.title).toBe('Inside');
  expect((await app.service.list('owner',eventQueryDto.parse({q:'INSIDE'}))).items).toHaveLength(1);
  expect((await app.service.list('owner',eventQueryDto.parse({projectId:randomUUID()}))).items).toHaveLength(0);
 });
 it.each([['DAILY',1,[],['2026-03-07','2026-03-08','2026-03-09']],['WEEKLY',1,[1],['2026-03-09','2026-03-16','2026-03-23']],['MONTHLY',1,[],['2026-03-07','2026-04-07','2026-05-07']],['CUSTOM_DAYS',2,[],['2026-03-07','2026-03-09','2026-03-11']]] as const)('reuses shared calendar for %s',async(frequency,interval,weekdays,expected)=>{
  const app=fake(),event=await app.service.create('owner',input());await app.service.configure('owner',event.id,rule({frequency,interval,weekdays:[...weekdays]}));
  const result=await app.service.occurrences('owner',event.id,query({to:'2026-06-01T00:00:00Z'}));expect(result.items.map((o)=>o.date)).toEqual(expected);
 });
 it('preserves local start across DST, clamps months and does not replace skipped gap slots',async()=>{
  const app=fake(),event=await app.service.create('owner',input());await app.service.configure('owner',event.id,rule());
  expect((await app.service.occurrences('owner',event.id,query())).items.map((o)=>o.startAt)).toEqual(['2026-03-07T14:00:00.000Z','2026-03-08T13:00:00.000Z','2026-03-09T13:00:00.000Z']);
  const gap=await app.service.create('owner',input({startAt:'2026-03-07T07:30:00Z',endAt:'2026-03-07T08:30:00Z'}));await app.service.configure('owner',gap.id,rule());expect((await app.service.occurrences('owner',gap.id,query())).items.map((o)=>o.date)).toEqual(['2026-03-07','2026-03-09']);
  const monthly=await app.service.create('owner',input());await app.service.configure('owner',monthly.id,rule({frequency:'MONTHLY',startDate:'2024-01-31'}));expect((await app.service.occurrences('owner',monthly.id,query({from:'2024-01-01T00:00:00Z',to:'2024-04-01T00:00:00Z'}))).items.map((o)=>o.date)).toEqual(['2024-01-31','2024-02-29','2024-03-31']);
 });
 it('moves one occurrence into/out of a window, cancels/restores it idempotently and preserves siblings',async()=>{
  const app=fake(),event=await app.service.create('owner',input());const configured=await app.service.configure('owner',event.id,rule());
  const q=query();expect(await app.service.occurrences('owner',event.id,q)).toEqual(await app.service.occurrences('owner',event.id,q));expect(app.snapshots.get(event.id)?.exceptions).toHaveLength(0);
  await app.service.exception('owner',event.id,configured.id,'2026-03-07',occurrencePatchDto.parse({startAt:'2026-04-10T12:00:00Z',endAt:'2026-04-10T14:00:00Z',title:'Moved'}));
  expect((await app.service.occurrences('owner',event.id,q)).items).toHaveLength(2);
  const moved=await app.service.occurrences('owner',event.id,query({from:'2026-04-10T13:00:00Z',to:'2026-04-10T15:00:00Z'}));expect(moved.items[0]?.date).toBe('2026-03-07');
  await app.service.exception('owner',event.id,configured.id,'2026-03-07',null,true);await app.service.exception('owner',event.id,configured.id,'2026-03-07',null,true);expect(app.snapshots.get(event.id)?.exceptions).toHaveLength(1);
  expect((await app.service.exception('owner',event.id,configured.id,'2026-03-07',null,false)).title).toBe('Moved');
  expect((await app.service.get('owner',event.id)).startAt).toBe('2026-03-07T14:00:00.000Z');
  await expect(app.service.exception('owner',event.id,configured.id,'2026-03-08',occurrencePatchDto.parse({endAt:'2026-03-01T00:00:00Z'}))).rejects.toMatchObject({status:400});
 });
 it('versions rule changes, isolates history and handles pause/resume/end/archive',async()=>{
  const app=fake(),event=await app.service.create('owner',input());const first=await app.service.configure('owner',event.id,rule());
  await app.service.exception('owner',event.id,first.id,'2026-03-07',null,true);
  await app.service.transition('owner',event.id,'suspend');expect((await app.service.occurrences('owner',event.id,query())).items).toHaveLength(1);
  await expect(app.service.exception('owner',event.id,first.id,'2026-03-08',null,true)).rejects.toMatchObject({status:409});
  await app.service.transition('owner',event.id,'resume');expect((await app.service.occurrences('owner',event.id,query())).items).toHaveLength(3);
  await expect(app.service.update('owner',event.id,patchEventDto.parse({timezone:'UTC'}))).rejects.toMatchObject({status:409});
  const next=await app.service.updateRule('owner',event.id,patchEventRuleDto.parse({anchorStartAt:'2026-03-07T15:00:00Z',anchorEndAt:'2026-03-07T16:00:00Z'}));expect(next.version).toBe(2);expect(next.id).not.toBe(first.id);
  expect((await app.service.occurrences('owner',event.id,query({ruleId:first.id}))).items).toHaveLength(1);
  await expect(app.service.exception('owner',event.id,first.id,'2026-03-07',null,false)).rejects.toMatchObject({status:409});
  await app.service.archive('owner',event.id,true);expect((await app.service.occurrences('owner',event.id,query())).items).toHaveLength(0);await expect(app.service.transition('owner',event.id,'resume')).rejects.toMatchObject({status:409});
  await app.service.archive('owner',event.id,false);await app.service.transition('owner',event.id,'end');await expect(app.service.transition('owner',event.id,'resume')).rejects.toMatchObject({status:409});
 });
});
it('HTTP enforces authentication, CSRF and ownership on every event operation',async()=>{
 const app=await setup();const created=await app.request('','POST',input());expect(created.status).toBe(201);const event=await created.json() as EventRecord;
 const configured=await app.request('/'+event.id+'/recurrence','POST',rule());expect(configured.status).toBe(201);const series=await configured.json() as {id:string};const root='/'+event.id;
 const actions:[string,string,unknown?][]=[['','GET'],['','POST',input()],[root,'GET'],[root,'PATCH',{title:'Edited'}],[root+'/archive','POST'],[root+'/restore','POST'],[root+'/recurrence','GET'],[root+'/recurrence','POST',rule()],[root+'/recurrence','PATCH',{interval:2}],...["suspend","resume","end"].map((s):[string,string]=>[root+'/recurrence/'+s,'POST']),[root+'/occurrences?from=2026-03-01T00:00:00Z&to=2026-04-01T00:00:00Z','GET'],[root+'/occurrences/'+series.id+'/2026-03-07','PATCH',{title:'One'}],[root+'/occurrences/'+series.id+'/2026-03-07/cancel','POST'],[root+'/occurrences/'+series.id+'/2026-03-07/restore','POST']];
 for(const[path,method,body]of actions){expect((await app.request(path,method,body,{} as typeof app.headers)).status).toBe(401);if(method!=='GET')expect((await app.request(path,method,body,{...app.headers,'X-CSRF-Token':''})).status).toBe(403);if(path.includes(event.id))expect((await app.request(path.replace(event.id,randomUUID()),method,body)).status).toBe(404);}
 expect((await app.request(root)).status).toBe(200);expect((await app.request(root+'/recurrence')).status).toBe(200);
 const occurrencePath=root+'/occurrences/'+series.id+'/2026-03-07';expect((await app.request(occurrencePath,'PATCH',{location:'Remote'})).status).toBe(200);for(const action of ['cancel','restore'])expect((await app.request(occurrencePath+'/'+action,'POST')).status).toBe(200);
 for(const action of ['suspend','resume','end'])expect((await app.request(root+'/recurrence/'+action,'POST')).status).toBe(200);
 expect((await app.request('','POST',{...input(),ownerId:'injected'})).status).toBe(400);
});
it('Prisma interval queries use overlap predicates, limits and owner; foreign mutation cannot touch rules — mocked client',async()=>{
 const event={findMany:vi.fn().mockResolvedValue([]),updateMany:vi.fn().mockResolvedValue({count:0})};const eventRecurrence={findMany:vi.fn()};const tx={event,eventRecurrence};
 const repo=createEventRepository({event,$transaction:async(fn:(t:typeof tx)=>unknown)=>fn(tx)} as unknown as PrismaClient);
 const q=eventQueryDto.parse({from:'2026-03-02T00:00:00Z',to:'2026-03-03T00:00:00Z',page:'2',limit:'5'});await repo.list('owner',q);
 expect(event.findMany).toHaveBeenCalledWith({where:{ownerId:'owner',archivedAt:null,endAt:{gt:q.from},startAt:{lt:q.to}},orderBy:[{startAt:'asc'},{id:'asc'}],skip:5,take:6});
 await expect(repo.mutate('other','id',()=>({change:{},result:null}))).rejects.toMatchObject({status:404});expect(eventRecurrence.findMany).not.toHaveBeenCalled();
});
