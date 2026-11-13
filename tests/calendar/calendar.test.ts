import {describe,it,expect,vi} from 'vitest';
import {calendarQueryDto,type CalendarMaster,type CalendarRepository} from '../../src/calendar/dto';
import {CalendarService} from '../../src/services/calendar.service';
import {RecurrenceService} from '../../src/services/recurrence.service';
import {EventService} from '../../src/services/event.service';
import {createCalendarRepository} from '../../src/infra/database/calendar-persistence';
import type {PrismaClient} from '../../src/generated/prisma/client';
const q=()=>calendarQueryDto.parse({from:'2026-03-08T00:00:00Z',to:'2026-03-10T00:00:00Z'});
const master=(id:string,recurring=false):CalendarMaster=>({timezone:'UTC',id,title:id,date:'2026-03-08',completed:false,startAt:'2026-03-07T23:00:00Z',endAt:'2026-03-08T01:00:00Z',rule:recurring?{id:'00000000-0000-4000-8000-000000000001',version:1,timezone:'America/New_York',modifiedDates:['2026-03-08']}:null});
function setup(tasks:CalendarMaster[]=[],events:CalendarMaster[]=[]){
 const repository:CalendarRepository={tasks:vi.fn(async(owner)=>owner==='owner'?tasks:[]),events:vi.fn(async(owner)=>owner==='owner'?events:[])};
 const taskOccurrences=vi.fn().mockResolvedValue({items:[{date:'2026-03-08',completedAt:'2026-03-08T12:00:00Z'}],page:{nextAfter:null}});
 const eventOccurrences=vi.fn().mockResolvedValue({items:[{date:'2026-03-08',title:'Moved',startAt:'2026-03-08T13:00:00Z',endAt:'2026-03-08T14:00:00Z',cancelled:false},{date:'2026-03-09',cancelled:true}],page:{hasMore:false}});
 return {repository,taskOccurrences,eventOccurrences,service:new CalendarService(repository,{run:fn=>fn({occurrences:taskOccurrences}as unknown as RecurrenceService)},{run:fn=>fn({occurrences:eventOccurrences}as unknown as EventService)})};
}
describe('calendar query',()=>{
 it.each([{}, {from:'bad',to:'bad'}, {from:'2026-01-01T00:00:00Z',to:'2026-01-01T00:00:00Z'}, {from:'2026-01-01T00:00:00Z',to:'2026-03-01T00:00:00Z'}, {types:'TASK,OTHER'}, {types:['TASK','EVENT']}, {types:'TASK,TASK'}, {extra:'x'}, {limit:'101'}])('rejects invalid %j',patch=>{expect(calendarQueryDto.safeParse({from:q().from.toISOString(),to:q().to.toISOString(),...patch,...(Object.keys(patch).length?{}:{from:undefined})}).success).toBe(false);});
});
it('projects standalone items, overlap event, completed task, stable origins and pagination',async()=>{
 const app=setup([{...master('task'),completed:true}],[master('event')]);const result=await app.service.list('owner',{...q(),limit:1},'America/Bahia');expect(result.items).toHaveLength(1);expect(result.page.hasMore).toBe(true);
 const all=await app.service.list('owner',q(),'America/Bahia');expect(all.items).toHaveLength(2);expect(all.items.find(i=>i.type==='TASK')).toMatchObject({date:'2026-03-08',completed:true,recurring:false,ruleId:null,href:'/tasks/task'});
 expect(app.repository.tasks).toHaveBeenCalledWith('owner','2026-03-07','2026-03-09');
 expect((await app.service.list('other',q(),'UTC')).items).toEqual([]);
});
it('reuses domain expansions and removes cancelled occurrences, preserving modified identity',async()=>{
 const app=setup([master('task',true)],[master('event',true)]);const result=await app.service.list('owner',q(),'UTC');expect(result.items).toHaveLength(2);expect(result.items.find(i=>i.type==='EVENT')).toMatchObject({title:'Moved',modified:true,occurrenceDate:'2026-03-08',version:1});expect(app.taskOccurrences).toHaveBeenCalledWith('owner','task',expect.objectContaining({from:'2026-03-07',to:'2026-03-09'}));
});
it('honors types and empty/inactive series using domain result rather than expanding independently',async()=>{
 const app=setup([master('t',true)],[master('e',true)]);app.taskOccurrences.mockResolvedValue({items:[],page:{nextAfter:null}});expect((await app.service.list('owner',{...q(),types:['TASK']},'UTC')).items).toEqual([]);expect(app.repository.events).not.toHaveBeenCalled();
});
it('rejects excessive masters rather than silently truncating',async()=>{
 const app=setup(Array.from({length:101},(_,i)=>master(String(i))));await expect(app.service.list('owner',q(),'UTC')).rejects.toMatchObject({status:409,code:'CALENDAR_LIMIT'});
});
it('Prisma limits ownership/archives/cancellations and correctly scopes overlap — isolated mock',async()=>{
 const task={findMany:vi.fn().mockResolvedValue([])},event={findMany:vi.fn().mockResolvedValue([])};const repo=createCalendarRepository({task,event}as unknown as PrismaClient);await repo.tasks('owner','2026-03-08','2026-03-09');await repo.events('owner',q().from,q().to);
 expect(task.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({ownerId:'owner',archivedAt:null,status:{not:'CANCELLED'}}),take:101}));expect(event.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({ownerId:'owner',archivedAt:null,OR:expect.arrayContaining([{recurrenceRules:{none:{}},startAt:{lt:q().to},endAt:{gt:q().from}}])}),take:101}));
});
it('HTTP requires a session and validates query with an authenticated isolated dependency',async()=>{
 const {createServer}=await import('node:http');const {createApp}=await import('../../src/app');const {authSettings}=await import('../../src/auth/settings');
 const session={user:{id:'owner',name:'Synthetic',email:'test@example.invalid',preferences:{timezone:'UTC',emailEnabled:false}},sessionId:'s',expiresAt:new Date('2099-01-01'),csrfToken:'unused'};
 const auth={settings:authSettings({}),run:async<T>(fn:(service:RecurrenceService)=>Promise<T>)=>fn({authenticate:async()=>session}as unknown as RecurrenceService)};
 const service=setup().service;
 const server=createServer(createApp('',{services:{auth:auth as unknown as import('../../src/auth/dependencies').AuthDependencies,calendar:{run:fn=>fn(service)},withTechnicalProbes:async()=>{throw new Error('Unused');}}}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
 try{const url=`http://127.0.0.1:${address.port}/calendar?from=2026-03-08T00:00:00Z&to=2026-03-09T00:00:00Z`;
 expect((await fetch(url)).status).toBe(401);const headers={Cookie:auth.settings.cookieName+'='+(await import('../../src/auth/crypto')).newSessionToken()};expect((await fetch(url,{headers})).status).toBe(200);expect((await fetch(url+'&types=OTHER',{headers})).status).toBe(400);expect((await fetch(url+'&types=TASK&types=EVENT',{headers})).status).toBe(400);
 }finally{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}
});
it('fails explicitly when expanded items exceed the global maximum',async()=>{
 const app=setup([],Array.from({length:100},(_,i)=>master('e'+i,true)));
 app.eventOccurrences.mockResolvedValue({items:Array.from({length:101},(_,i)=>({date:'2026-03-'+String(i%20+1).padStart(2,'0'),title:'Many',startAt:'2026-03-08T12:00:00Z',endAt:'2026-03-08T13:00:00Z',cancelled:false})),page:{hasMore:false}});
 await expect(app.service.list('owner',{...q(),types:['EVENT']},'UTC')).rejects.toMatchObject({status:409,code:'CALENDAR_LIMIT'});
});
