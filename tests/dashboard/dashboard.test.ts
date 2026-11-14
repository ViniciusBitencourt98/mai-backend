import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardQueryDto } from '../../src/dashboard/dto';
import { addDays, dayStart } from '../../src/dashboard/time';
import { DashboardService } from '../../src/services/dashboard.service';
import { CalendarService } from '../../src/services/calendar.service';
import type { CalendarMaster, CalendarPublication, CalendarItem } from '../../src/calendar/dto';
import { createCalendarRepository } from '../../src/infra/database/calendar-persistence';
import { createDashboardRepository } from '../../src/infra/database/dashboard-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import type { AuthDependencies } from '../../src/auth/dependencies';
import type { AuthService } from '../../src/services/auth.service';
import { newSessionToken } from '../../src/auth/crypto';
const date = '2026-03-08';
const query = (extra = {}) => dashboardQueryDto.parse({ date, ...extra });
const master = (id: string, changes: Partial<CalendarMaster> = {}): CalendarMaster => ({ id, title: id, timezone: 'UTC', date, completed: false,
  startAt: date + 'T12:00:00.000Z', endAt: date + 'T13:00:00.000Z', rule: null, ...changes });
const publication = (id: string, changes: Partial<CalendarPublication> = {}): CalendarPublication => ({ id, title: id, scheduledAt: new Date(date + 'T12:00:00Z'), status: 'PLANNED', platform: 'INSTAGRAM', projectId: null, ...changes });
// Only the persistence boundary is simulated. Calendar aggregation is the production service.
function fixture(tasks: CalendarMaster[] = [], events: CalendarMaster[] = [], publications: CalendarPublication[] = []) {
  const calendarRepository = {
    tasks: vi.fn(async (owner: string, from: string, to: string) => owner === 'A' ? tasks.filter((t) => t.date && t.date >= from && t.date <= to) : []),
    events: vi.fn(async (owner: string, from: Date, to: Date) => owner === 'A' ? events.filter((e) => e.startAt! < to.toISOString() && e.endAt! > from.toISOString()) : []),
    publications: vi.fn(async (owner: string, from: Date, to: Date) => owner === 'A' ? publications.filter((p) => p.status !== 'CANCELLED' && p.scheduledAt >= from && p.scheduledAt < to) : []),
  };
  const expansion = vi.fn(async (): Promise<never> => { throw new Error('No recurrence expected'); });
  const calendar = new CalendarService(calendarRepository, { run: expansion }, { run: expansion });
  const pendingTasks = vi.fn(async (owner: string) => owner === 'A' ? 42 : 0);
  const calendarRun = vi.fn();
  const service = new DashboardService({ pendingTasks }, { run: (fn) => { calendarRun(); return fn(calendar); } }, () => new Date('2026-03-09T01:00:00Z'));
  return { service, calendar, calendarRepository, pendingTasks, calendarRun };
}
describe('dashboard query and temporal boundaries', () => {
  it('defaults limit and rejects unknown/repeated/invalid parameters', () => {
    expect(dashboardQueryDto.parse({})).toEqual({ limit: 10 });
    expect(query({ limit: '20' })).toEqual({ date, limit: 20 });
    for (const input of [{ date: '2026-02-30' }, { date: '0000-01-01' }, { date: [date, date] }, { timezone: 'UTC' }, { ownerId: 'B' }, { limit: '0' }, { limit: '21' }, { limit: '1.5' }, { limit: ['1','2'] }]) {
      expect(dashboardQueryDto.safeParse(input).success).toBe(false);
    }
  });
  it('selects today using the session timezone rather than UTC', async () => {
    const result = await fixture().service.get('A', dashboardQueryDto.parse({}), 'America/Bahia');
    expect(result.date).toBe('2026-03-08'); expect(result.timezone).toBe('America/Bahia');
    expect(result.windows.today).toEqual({ from: '2026-03-08T03:00:00.000Z', to: '2026-03-09T03:00:00.000Z' });
  });
  it.each([['2026-03-08', 23], ['2026-11-01', 25]] as const)('uses the real civil day duration across New York DST %s', (day, hours) => {
    expect(dayStart(addDays(day, 1), 'America/New_York').getTime() - dayStart(day, 'America/New_York').getTime()).toBe(hours * 3600000);
  });
  it('handles midnight gaps and rejects an entirely skipped selected day', async () => {
    expect(dayStart('2018-11-04', 'America/Sao_Paulo', true).toISOString()).toBe('2018-11-04T03:00:00.000Z');
    await expect(fixture().service.get('A', query({ date: '2011-12-30' }), 'Pacific/Apia')).rejects.toMatchObject({ status: 400 });
    expect(dayStart('2011-12-30', 'Pacific/Apia').toISOString()).toBe('2011-12-30T10:00:00.000Z');
  });
  it('rejects invalid stored timezone and unsupported edge windows', async () => {
    await expect(fixture().service.get('A', query(), 'bad/zone')).rejects.toMatchObject({ status: 400 });
    for (const day of ['0001-01-01','9999-12-31']) await expect(fixture().service.get('A', query({ date: day }), 'UTC')).rejects.toMatchObject({ status: 400 });
  });
});
describe('dashboard aggregation, isolated persistence', () => {
  it('returns empty lists and zero counts when there are no records', async () => {
    const app = fixture(); app.pendingTasks.mockResolvedValue(0);
    const result = await app.service.get('A', query(), 'UTC');
    expect(result.counts).toEqual({ pendingTasks: 0, overdueTasks: 0, todayActivities: 0, plannedPublications: 0 });
    for (const list of [result.today,result.overdueTasks,result.upcomingTasks,result.upcomingEvents,result.upcomingPublications]) expect(list).toEqual({ items: [], hasMore: false });
  });
  it('classifies tasks, completion, today overlap and future items with exact bounded counts', async () => {
    const app = fixture([master('today'),master('completed-today',{completed:true}),master('late',{date:'2026-03-07'}),master('done',{date:'2026-03-06',completed:true}),master('future',{date:'2026-03-09'}),master('old',{date:'2025-01-01'}),master('undated',{date:null})],
      [master('overnight',{startAt:'2026-03-07T23:00:00.000Z',endAt:'2026-03-08T01:00:00.000Z'}), master('future-event',{startAt:'2026-03-09T00:00:00.000Z',endAt:'2026-03-09T01:00:00.000Z'})],
      [publication('today-publication'),publication('next-publication',{scheduledAt:new Date('2026-03-09T00:00:00Z')}),publication('published',{status:'PUBLISHED',scheduledAt:new Date('2026-03-10T00:00:00Z')}),publication('cancelled',{status:'CANCELLED'})]);
    const result = await app.service.get('A', query(), 'UTC');
    expect(result.counts).toEqual({ pendingTasks: 42, overdueTasks: 1, todayActivities: 4, plannedPublications: 2 });
    expect(result.today.items.map((i) => i.id)).toEqual(['overnight','completed-today','today','today-publication']);
    expect(result.overdueTasks.items.map((i) => i.id)).toEqual(['late']);
    expect(result.upcomingTasks.items.map((i) => i.id)).toEqual(['future']);
    expect(result.upcomingEvents.items.map((i) => i.id)).toEqual(['future-event']);
    expect(result.upcomingPublications.items.map((i) => i.id)).toEqual(['next-publication']);
    expect(app.calendarRun).toHaveBeenCalledTimes(1); expect(app.pendingTasks).toHaveBeenCalledWith('A');
    expect(app.calendarRepository.tasks).toHaveBeenCalledTimes(2); expect(app.calendarRepository.events).toHaveBeenCalledTimes(1); expect(app.calendarRepository.publications).toHaveBeenCalledTimes(1);
  });
  it('limits each list, keeps counts before slicing and orders deterministically', async () => {
    const app = fixture([master('b'),master('a')]); const result = await app.service.get('A', query({ limit: '1' }), 'UTC');
    expect(result.today).toMatchObject({ items: [{id:'a'}], hasMore: true }); expect(result.counts.todayActivities).toBe(2);
  });
  it('does not duplicate civil tasks whose zoned day intersects today and the next day', async () => {
    const app = fixture([master('civil',{date:'2026-03-08',timezone:'America/New_York'})]);
    const result = await app.service.get('A', query(), 'UTC');
    expect(result.today.items.map((i) => i.id)).toEqual(['civil']); expect(result.upcomingTasks.items).toEqual([]);
  });
  it('keeps an event spanning today and tomorrow only in today', async () => {
    const app = fixture([], [master('spanning',{startAt:'2026-03-08T23:00:00.000Z',endAt:'2026-03-09T02:00:00.000Z'})]);
    const result = await app.service.get('A', query(), 'UTC');
    expect(result.today.items).toHaveLength(1); expect(result.upcomingEvents.items).toEqual([]);
  });
  it('isolates the authenticated owner across calendar and count queries', async () => {
    const app = fixture([master('private')],[],[publication('private-publication')]);
    const result = await app.service.get('B', query(), 'UTC');
    expect(result.today.items).toEqual([]); expect(result.counts.pendingTasks).toBe(0); expect(app.pendingTasks).toHaveBeenCalledWith('B');
    expect(app.calendarRepository.tasks).toHaveBeenCalledWith('B',expect.any(String),expect.any(String));
  });
  it('fails on domain limits instead of returning a partial dashboard', async () => {
    const app = fixture(Array.from({length:101},(_,i)=>master(String(i))));
    await expect(app.service.get('A',query(),'UTC')).rejects.toMatchObject({status:409,code:'CALENDAR_LIMIT'});
    expect(app.pendingTasks).not.toHaveBeenCalled();
  });
  it('bounds combined visible candidates even when both source windows individually fit', async () => {
    const task: CalendarItem = {type:'TASK',id:'t',masterId:'t',title:'Task',date,completed:false,timezone:'UTC',ruleId:null,version:null,occurrenceDate:null,recurring:false,modified:false,href:'/tasks/t'};
    const collect=vi.fn().mockResolvedValue({items:Array(5001).fill(task),timezone:'UTC'});
    const service=new DashboardService({pendingTasks:vi.fn()},{run:fn=>fn({collect} as unknown as CalendarService)});
    await expect(service.get('A',query(),'UTC')).rejects.toMatchObject({status:409,code:'DASHBOARD_LIMIT'});
  });
});
it('counts active task masters in PostgreSQL without loading rows, scoped by owner/status/archive — mocked client', async () => {
  const count=vi.fn().mockResolvedValue(3); const repo=createDashboardRepository({task:{count}} as unknown as PrismaClient);
  expect(await repo.pendingTasks('A')).toBe(3);
  expect(count).toHaveBeenCalledWith({where:{ownerId:'A',archivedAt:null,status:{in:['PENDING','IN_PROGRESS']}}});
});
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})));});
it('HTTP requires a session, derives owner/timezone from it and rejects unknown/repeated parameters',async()=>{
  const app=fixture([master('private')]);let owner='A';const settings=authSettings({CORS_ALLOWED_ORIGIN:'https://app.example.invalid'});
  const auth:AuthDependencies={settings,run:fn=>fn({authenticate:async()=>({user:{id:owner,name:'Synthetic',email:'test@example.invalid',preferences:{timezone:'UTC',emailEnabled:false}},sessionId:'s',expiresAt:new Date('2099-01-01'),csrfToken:'unused'})} as unknown as AuthService)};
  const server=createServer(createApp('',{services:{auth,dashboard:{run:fn=>fn(app.service)},withTechnicalProbes:async()=>{throw new Error('Unused');}}}));servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
  const url=`http://127.0.0.1:${address.port}/dashboard?date=${date}`;
  expect((await fetch(url)).status).toBe(401);const headers={Cookie:settings.cookieName+'='+newSessionToken(),Origin:'https://app.example.invalid'};
  const response=await fetch(url,{headers});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(await response.json()).toMatchObject({date,counts:{todayActivities:1}});
  for(const suffix of ['&ownerId=B','&timezone=UTC','&date=2026-03-09','&limit=1&limit=2','&limit=21'])expect((await fetch(url+suffix,{headers})).status).toBe(400);
  owner='B';expect(await(await fetch(url,{headers})).json()).toMatchObject({counts:{todayActivities:0,pendingTasks:0}});
  const preflight=await fetch(url,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Method':'GET'}});expect(preflight.status).toBe(204);expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
});

it('inherits archive/cancel/undated publication filtering from the production calendar repository', async () => {
  const rows=[{...publication('active'),archivedAt:null},{...publication('archived'),archivedAt:new Date(date)},
    {...publication('cancelled',{status:'CANCELLED'}),archivedAt:null},{...publication('undated'),scheduledAt:null,archivedAt:null}];
  const findMany=vi.fn(async (args:{where:{archivedAt:null;status:{not:string};scheduledAt:{gte:Date;lt:Date};ownerId:string}})=>{
    expect(args.where.ownerId).toBe('A');expect(args.where.archivedAt).toBeNull();expect(args.where.status.not).toBe('CANCELLED');
    return rows.filter(r=>r.archivedAt===args.where.archivedAt&&r.status!==args.where.status.not&&r.scheduledAt&&r.scheduledAt>=args.where.scheduledAt.gte&&r.scheduledAt<args.where.scheduledAt.lt);
  });
  const repository={...createCalendarRepository({publication:{findMany}} as unknown as PrismaClient),tasks:async()=>[],events:async()=>[]};
  const noExpansion=async():Promise<never>=>{throw new Error('Unexpected expansion');};
  const calendar=new CalendarService(repository,{run:noExpansion},{run:noExpansion});
  const service=new DashboardService({pendingTasks:async()=>0},{run:fn=>fn(calendar)});
  const result=await service.get('A',query(),'UTC');expect(result.today.items.map(i=>i.id)).toEqual(['active']);expect(result.counts.plannedPublications).toBe(1);
});
it('uses exclusive future boundary and hides completed future tasks/publications already published',async()=>{
  const app=fixture([master('done-future',{date:'2026-03-09',completed:true})],[],[
    publication('last',{scheduledAt:new Date('2026-03-15T23:59:59.999Z')}),publication('end',{scheduledAt:new Date('2026-03-16T00:00:00Z')}),
    publication('done',{scheduledAt:new Date('2026-03-09T12:00:00Z'),status:'PUBLISHED'})]);
  const result=await app.service.get('A',query(),'UTC');expect(result.upcomingTasks.items).toEqual([]);expect(result.upcomingPublications.items.map(i=>i.id)).toEqual(['last']);
});
it('rejects a failed aggregate instead of returning misleading zero indicators',async()=>{
  const failure=new Error('Database unavailable');const app=fixture();app.pendingTasks.mockRejectedValue(failure);
  await expect(app.service.get('A',query(),'UTC')).rejects.toBe(failure);
});
