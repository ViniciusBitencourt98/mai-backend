import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { HttpError } from '../../src/errors/http-error';
import { RecurrenceService } from '../../src/services/recurrence.service';
import type { RecurrenceRepository } from '../../src/repositories/recurrence.repository';
import { createRuleDto, patchRuleDto, occurrenceQueryDto, type RuleRecord, type RecurrenceSnapshot } from '../../src/recurrence/dto';
import { schedule } from '../../src/recurrence/engine';
import { createRecurrenceRepository } from '../../src/infra/database/recurrence-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';
const input = (extra = {}) => createRuleDto.parse({ frequency: 'DAILY', startDate: '2026-11-01', timezone: 'America/Bahia', ...extra });
function fake(owner = 'owner') {
  const taskId = randomUUID();
  const state: RecurrenceSnapshot = { archived: false, current: null, rules: [], occurrences: [] };
  const events: unknown[] = []; let now = new Date('2026-11-13T01:00:00Z');
  const repository: RecurrenceRepository = {
    async read(ownerId,id) { if(ownerId!==owner || id!==taskId) throw new HttpError(404,'NOT_FOUND','Task not found'); return structuredClone(state); },
    async mutate(ownerId,id,operation) {
      const { change, result } = operation(await repository.read(ownerId,id));
      if(change.rule) { const i=state.rules.findIndex((r)=>r.id===change.rule!.id); if(i>=0)state.rules[i]=change.rule;else state.rules.push(change.rule);
        state.current=[...state.rules].sort((a,b)=>b.version-a.version)[0]!; }
      if(change.occurrence) { const i=state.occurrences.findIndex((o)=>o.ruleId===change.occurrence!.ruleId&&o.date===change.occurrence!.date); if(i>=0)state.occurrences[i]=change.occurrence;else state.occurrences.push(change.occurrence); }
      if(change.event)events.push(change.event);
      return result;
    },
  };
  return { taskId, state, events, repository, service: new RecurrenceService(repository,()=>now), advance:()=>{now=new Date(now.getTime()+10000);} };
}
const servers: Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map((server)=>new Promise<void>((resolve)=>{server.close(()=>resolve());server.closeAllConnections();})));});
async function setup() {
  const ownerId=randomUUID(); const data=fake(ownerId);const token=newSessionToken();
  const fakeAuth=authRepositoryFake({id:ownerId,name:'Synthetic',email:'test@example.invalid',passwordHash:'unused',disabledAt:null,preferences:{timezone:'America/Bahia',emailEnabled:false}});
  await fakeAuth.repository.issueSession({userId:ownerId,tokenHash:digest(token),expiresAt:new Date(Date.now()+60000),now:new Date()});
  const settings=authSettings({AUTH_PUBLIC_ORIGIN:'https://api.example.invalid',CORS_ALLOWED_ORIGIN:'https://app.example.invalid'});
  const app=createApp('',{services:{auth:{settings,run:(fn)=>fn(new AuthService(fakeAuth.repository))},recurrence:{run:(fn)=>fn(data.service)},withTechnicalProbes:async()=>{throw new Error('Unused');}}});
  const server=createServer(app);servers.push(server);await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
  const headers={Cookie:settings.cookieName+'='+token,Origin:'https://app.example.invalid','X-CSRF-Token':csrfToken(token),'Content-Type':'application/json'};
  const request=(path:string,method='GET',body?:unknown,custom=headers)=>fetch(`http://127.0.0.1:${address.port}/tasks${path}`,{method,headers:custom,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {...data,ownerId,headers,request};
}
describe('bounded civil recurrence engine',()=>{
  it('generates daily/custom days, with count and inclusive end date',()=>{
    expect(schedule(input({count:3}))).toEqual(['2026-11-01','2026-11-02','2026-11-03']);
    expect(schedule(input({frequency:'CUSTOM_DAYS',interval:3,endDate:'2026-11-07'}))).toEqual(['2026-11-01','2026-11-04','2026-11-07']);
    expect(schedule(input()).length).toBe(10000);
  });
  it('anchors weekly intervals on Monday and omits selected weekdays before start',()=>{
    expect(schedule(input({frequency:'WEEKLY',startDate:'2026-11-04',weekdays:[1,5],interval:2,count:4}))).toEqual(['2026-11-06','2026-11-16','2026-11-20','2026-11-30']);
  });
  it.each([29,30,31])('clamps day %i and restores anchor in later months',day=>{
    const dates=schedule(input({frequency:'MONTHLY',startDate:`2025-01-${day}`,count:3}));
    expect(dates).toEqual([`2025-01-${day}`,'2025-02-28',`2025-03-${day}`]);
  });
  it('handles leap years and century exceptions',()=>{
    expect(schedule(input({frequency:'MONTHLY',startDate:'2024-01-31',count:3}))).toEqual(['2024-01-31','2024-02-29','2024-03-31']);
    expect(schedule(input({frequency:'MONTHLY',interval:12,startDate:'2096-02-29',count:5}))).toEqual(['2096-02-29','2097-02-28','2098-02-28','2099-02-28','2100-02-28']);
  });
  it.each(['America/New_York','Europe/Berlin','Pacific/Auckland'])('preserves civil dates across DST in %s',timezone=>{
    expect(schedule(input({timezone,startDate:'2026-03-07',count:4}))).toEqual(['2026-03-07','2026-03-08','2026-03-09','2026-03-10']);
    expect(schedule(input({timezone,startDate:'2026-10-31',count:3}))).toEqual(['2026-10-31','2026-11-01','2026-11-02']);
  });
  it.each([{timezone:'Invalid/Zone'},{interval:0},{count:0},{weekdays:[1,1]},{ownerId:'injected'},{startDate:'2026-02-30'}])('rejects invalid DTO %j',patch=>{expect(createRuleDto.safeParse({...input(),...patch}).success).toBe(false);});
  it('rejects inconsistent weekly/dates and unbounded queries',()=>{
    expect(()=>schedule(input({frequency:'WEEKLY'}))).toThrow();
    expect(()=>schedule(input({weekdays:[1]}))).toThrow();
    expect(()=>schedule(input({endDate:'2026-01-01'}))).toThrow();
    expect(occurrenceQueryDto.safeParse({from:'2026-01-01',to:'2027-12-31'}).success).toBe(false);
    expect(occurrenceQueryDto.safeParse({from:'2026-01-01',to:'2026-01-31',limit:'101'}).success).toBe(false);
    expect(patchRuleDto.safeParse({}).success).toBe(false);
  });
});
describe('recurrence state and ownership — isolated persistence',()=>{
  it('computes next date in rule timezone and preserves isolated completion/history/idempotence',async()=>{
    const app=fake();const rule=await app.service.configure('owner',app.taskId,input());
    expect((await app.service.get('owner',app.taskId)).nextOccurrenceDate).toBe('2026-11-12');
    const first=await app.service.setCompleted('owner',app.taskId,rule.id,'2026-11-12',true);app.advance();
    expect((await app.service.setCompleted('owner',app.taskId,rule.id,'2026-11-12',true)).completedAt).toBe(first.completedAt);expect(app.events).toHaveLength(1);
    expect((await app.service.get('owner',app.taskId)).nextOccurrenceDate).toBe('2026-11-13');
    const q=occurrenceQueryDto.parse({from:'2026-11-11',to:'2026-11-14',limit:'2'});
    const page=await app.service.occurrences('owner',app.taskId,q);expect(page.items.map(o=>o.date)).toEqual(['2026-11-11','2026-11-12']);expect(page.page.nextAfter).toBe('2026-11-12');
    expect(await app.service.occurrences('owner',app.taskId,q)).toEqual(page);expect(app.state.occurrences).toHaveLength(1);
    expect((await app.service.occurrences('owner',app.taskId,{...q,after:page.page.nextAfter!})).items[0]?.date).toBe('2026-11-13');
    await app.service.setCompleted('owner',app.taskId,rule.id,'2026-11-12',false);expect(app.events).toHaveLength(2);
    expect((await app.service.get('owner',app.taskId)).nextOccurrenceDate).toBe('2026-11-12');
    await expect(app.service.setCompleted('owner',app.taskId,rule.id,'2026-10-01',true)).rejects.toMatchObject({status:404});
  });
  it('suspends/resumes without moving anchor, archives without data loss, and ends permanently',async()=>{
    const app=fake();const rule=await app.service.configure('owner',app.taskId,input());
    await app.service.setCompleted('owner',app.taskId,rule.id,'2026-11-12',true);
    await app.service.transition('owner',app.taskId,'suspend');
    const q=occurrenceQueryDto.parse({from:'2026-11-01',to:'2026-11-15'});
    expect((await app.service.occurrences('owner',app.taskId,q)).items).toHaveLength(1);expect((await app.service.get('owner',app.taskId)).nextOccurrenceDate).toBeNull();
    await expect(app.service.setCompleted('owner',app.taskId,rule.id,'2026-11-13',true)).rejects.toMatchObject({status:409});
    await app.service.transition('owner',app.taskId,'resume');expect((await app.service.occurrences('owner',app.taskId,q)).items).toHaveLength(15);
    app.state.archived=true;expect((await app.service.get('owner',app.taskId)).nextOccurrenceDate).toBeNull();
    await expect(app.service.update('owner',app.taskId,{interval:2})).rejects.toMatchObject({status:409});
    await expect(app.service.setCompleted('owner',app.taskId,rule.id,'2026-11-13',true)).rejects.toMatchObject({status:409});
    app.state.archived=false;await app.service.transition('owner',app.taskId,'end');await app.service.transition('owner',app.taskId,'end');
    await expect(app.service.transition('owner',app.taskId,'resume')).rejects.toMatchObject({status:409});
    await expect(app.service.update('owner',app.taskId,{interval:2})).rejects.toMatchObject({status:409});
  });
  it('versions edits, retains prior completion and rejects foreign tasks/rules',async()=>{
    const app=fake();const old=await app.service.configure('owner',app.taskId,input());
    await app.service.setCompleted('owner',app.taskId,old.id,'2026-11-12',true);
    const next=await app.service.update('owner',app.taskId,{interval:2});expect(next.version).toBe(2);expect(next.id).not.toBe(old.id);
    const q=occurrenceQueryDto.parse({from:'2026-11-01',to:'2026-11-30',ruleId:old.id});expect((await app.service.occurrences('owner',app.taskId,q)).items).toHaveLength(1);
    await expect(app.service.setCompleted('owner',app.taskId,old.id,'2026-11-12',false)).rejects.toMatchObject({status:409});
    await expect(app.service.setCompleted('owner',app.taskId,randomUUID(),'2026-11-12',true)).rejects.toMatchObject({status:404});
    await expect(app.service.get('other',app.taskId)).rejects.toMatchObject({status:404});
    await expect(app.service.configure('other',app.taskId,input())).rejects.toMatchObject({status:404});
    await expect(app.service.configure('owner',app.taskId,input())).rejects.toMatchObject({status:409});
  });
});
it('HTTP protects every recurrence endpoint, handles merged params and keeps ordinary tasks routing intact',async()=>{
 const app=await setup();const root='/'+app.taskId;const created=await app.request(root+'/recurrence','POST',input());expect(created.status).toBe(201);
 const rule=await created.json() as RuleRecord;
 const actions:[string,string,unknown?][]=[['/recurrence','GET'],['/recurrence','POST',input()],['/recurrence','PATCH',{interval:2}],['/recurrence/suspend','POST'],['/recurrence/resume','POST'],['/recurrence/end','POST'],['/occurrences?from=2026-11-01&to=2026-11-30','GET'],['/occurrences/'+rule.id+'/2026-11-12/complete','POST'],['/occurrences/'+rule.id+'/2026-11-12/reopen','POST']];
 for(const[path,method,body]of actions){
  expect((await app.request(root+path,method,body,{} as typeof app.headers)).status).toBe(401);
  if(method!=='GET')expect((await app.request(root+path,method,body,{...app.headers,'X-CSRF-Token':''})).status).toBe(403);
  expect((await app.request('/'+randomUUID()+path,method,body)).status).toBe(404);
 }
 expect((await app.request(root+'/recurrence')).status).toBe(200);
 expect((await app.request(root+'/occurrences?from=2026-11-01&to=2026-11-30')).status).toBe(200);
 for(const action of ['complete','reopen'])expect((await app.request(root+'/occurrences/'+rule.id+'/2026-11-12/'+action,'POST')).status).toBe(200);
 expect((await app.request(root+'/recurrence','PATCH',{interval:2})).status).toBe(200);
 for(const action of ['suspend','resume','end'])expect((await app.request(root+'/recurrence/'+action,'POST')).status).toBe(200);
});
it('Prisma mutation locks the owned task before reading configuration — mocked transaction',async()=>{
 const tx={task:{updateMany:vi.fn().mockResolvedValue({count:0}),findFirst:vi.fn()},taskRecurrence:{findMany:vi.fn()},taskOccurrence:{findMany:vi.fn()}};
 const repository=createRecurrenceRepository({$transaction:async(fn:(t:typeof tx)=>unknown)=>fn(tx)} as unknown as PrismaClient);
 await expect(repository.mutate('other','task',()=>({change:{},result:null}))).rejects.toMatchObject({status:404});
 expect(tx.task.updateMany).toHaveBeenCalledWith({where:{id:'task',ownerId:'other'},data:{updatedAt:expect.any(Date)}});expect(tx.taskRecurrence.findMany).not.toHaveBeenCalled();
});
