import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { TaskService } from '../../src/services/task.service';
import type { TaskRepository } from '../../src/repositories/task.repository';
import { createTaskDto, patchTaskDto, taskQueryDto, type TaskRecord } from '../../src/tasks/dto';
import { createTaskRepository } from '../../src/infra/database/task-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';

import { HttpError } from '../../src/errors/http-error';
import { civilDate, localToday, createSubtaskDto, patchSubtaskDto, reorderSubtasksDto, type SubtaskRecord } from '../../src/tasks/dto';
function fake() {
  const records = new Map<string, TaskRecord>(); const projects = new Map<string, string>(); const subtasks = new Map<string, SubtaskRecord[]>();
  let now = new Date('2026-11-13T01:00:00Z');
  const repository: TaskRepository = {
    async create(ownerId, data) { const row = { ...data, ownerId, id: randomUUID(), createdAt: now, updatedAt: now }; records.set(row.id, row); return row; },
    async find(ownerId, id) { const row = records.get(id); return row?.ownerId === ownerId ? row : null; },
    async ownsProject(ownerId, id) { return projects.get(id) === ownerId; },
    async mutate(ownerId, id, fn) { const current = await repository.find(ownerId, id); if (!current) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
      const next = { ...current, ...fn(structuredClone(current)), updatedAt: now }; records.set(id, next); return next; },
    async listSubtasks(ownerId, id) { return await repository.find(ownerId, id) ? subtasks.get(id) ?? [] : null; },
    async mutateSubtasks(ownerId, id, fn) { if (!await repository.find(ownerId, id)) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
      const next = fn(structuredClone(subtasks.get(id) ?? [])); subtasks.set(id, next); return next; },
    async list(ownerId, q, today) {
      const filtered = [...records.values()].filter((row) => row.ownerId === ownerId && (q.includeArchived || !row.archivedAt) && (!q.q || row.title.toLowerCase().includes(q.q.toLowerCase())) && (!q.status || row.status === q.status) && (!q.priority || row.priority === q.priority) && (!q.projectId || row.projectId === q.projectId) && (!q.withoutProject || row.projectId === null) && (!q.withoutDueDate || row.dueDate === null) && (!q.dueFrom || row.dueDate !== null && row.dueDate >= civilDate(q.dueFrom)!) && (!q.dueTo || row.dueDate !== null && row.dueDate <= civilDate(q.dueTo)!) && (!q.overdue || row.dueDate !== null && row.dueDate < civilDate(today)! && ['PENDING','IN_PROGRESS'].includes(row.status)));
      const ranks = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };
      filtered.sort((a,b) => {
        const x = q.sort === 'priority' ? ranks[a.priority] : a[q.sort]?.getTime() ?? null;
        const y = q.sort === 'priority' ? ranks[b.priority] : b[q.sort]?.getTime() ?? null;
        if (x === null || y === null) return x === y ? a.id.localeCompare(b.id) : x === null ? 1 : -1;
        return (x-y) * (q.order === 'asc' ? 1 : -1) || a.id.localeCompare(b.id);
      });
      return filtered.slice((q.page-1)*q.limit, q.page*q.limit+1);
    },
  };
  return { repository, records, projects, subtasks, service: new TaskService(repository, () => now), advance: () => { now = new Date(now.getTime()+10000); } };
}
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function setup() {
  const tasks = fake(); const ownerId = randomUUID(); const token = newSessionToken();
  const auth = authRepositoryFake({ id: ownerId, name: 'Synthetic', email: 'test@example.invalid', passwordHash: 'unused', disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } });
  await auth.repository.issueSession({ userId: ownerId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000), now: new Date() });
  const settings = authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.example.invalid', CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const app = createApp('', { services: { auth: { settings, run: (fn) => fn(new AuthService(auth.repository)) }, tasks: { run: (fn) => fn(tasks.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const headers = { Cookie: settings.cookieName + '=' + token, Origin: 'https://app.example.invalid', 'X-CSRF-Token': csrfToken(token), 'Content-Type': 'application/json' };
  const request = (path = '', method = 'GET', body?: unknown, custom = headers) => fetch(`http://127.0.0.1:${address.port}/tasks${path}`, { method, headers: custom, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ...tasks, ownerId, headers, request };
}



describe('task validation', () => {
  it.each([{}, {title:''}, {title:' '}, {title:'x'.repeat(201)}, {title:'ok',status:'pending'}, {title:'ok',priority:'extreme'}, {title:'ok',dueDate:'2026-02-30'}, {title:'ok',startDate:'2026-01-01T00:00:00Z'}, {title:'ok',ownerId:randomUUID()}, {title:'ok',completedAt:'2026-01-01'}, {title:'ok',recurrence:{}}, {title:'ok',projectId:'invalid'}])('rejects invalid create %j', (input) => { expect(createTaskDto.safeParse(input).success).toBe(false); });
  it('defaults a standalone task and rejects empty/readonly patches', () => {
    expect(createTaskDto.parse({title:' Idea '})).toEqual({title:'Idea',description:null,status:'PENDING',priority:'MEDIUM',startDate:null,dueDate:null,projectId:null});
    expect(patchTaskDto.safeParse({}).success).toBe(false); expect(patchTaskDto.safeParse({completedAt:null}).success).toBe(false);
    expect(patchSubtaskDto.safeParse({}).success).toBe(false); expect(createSubtaskDto.safeParse({title:' '}).success).toBe(false);
  });
  it.each([{limit:'101'}, {page:'0'}, {status:'done'}, {priority:'urgent'}, {dueFrom:'2026-12-01',dueTo:'2026-01-01'}, {withoutDueDate:'true',overdue:'true'}, {withoutDueDate:'true',dueTo:'2026-12-01'}, {projectId:randomUUID(),withoutProject:'true'}, {q:['a','b']}, {order:'bad'}, {extra:'x'}])('rejects query %j', (query) => { expect(taskQueryDto.safeParse(query).success).toBe(false); });
});
describe('task rules — isolated persistence', () => {
  it('validates merged dates, ownership of optional projects and clearing fields', async () => {
    const app=fake(); const projectId=randomUUID(); app.projects.set(projectId,'owner');
    const row=await app.service.create('owner',createTaskDto.parse({title:'Film',projectId,startDate:'2026-11-01',dueDate:'2026-11-13'}));
    await expect(app.service.update('owner',row.id,{startDate:'2026-12-01'})).rejects.toMatchObject({status:400});
    await expect(app.service.create('owner',createTaskDto.parse({title:'Bad',startDate:'2026-12-01',dueDate:'2026-01-01'}))).rejects.toMatchObject({status:400});
    const foreign=randomUUID(); app.projects.set(foreign,'other');
    for(const id of [foreign,randomUUID()]) {
      await expect(app.service.create('owner',createTaskDto.parse({title:'Attack',projectId:id}))).rejects.toMatchObject({status:404,message:'Project not found'});
      await expect(app.service.update('owner',row.id,{projectId:id})).rejects.toMatchObject({status:404});
    }
    expect(await app.service.update('owner',row.id,{projectId:null,description:null,startDate:null,dueDate:null})).toMatchObject({projectId:null,startDate:null,dueDate:null});
  });
  it.each(['LOW','MEDIUM','HIGH','URGENT'] as const)('supports priority %s', async (priority) => {
    const app=fake(); const row=await app.service.create('owner',createTaskDto.parse({title:'Task',priority}));
    expect(row.priority).toBe(priority); expect((await app.service.update('owner',row.id,{priority})).priority).toBe(priority);
  });
  it('maintains completedAt, validates terminal transitions and completes independently of subtasks', async () => {
    const app=fake(); const row=await app.service.create('owner',createTaskDto.parse({title:'Task'}));
    await app.service.addSubtask('owner',row.id,createSubtaskDto.parse({title:'Unfinished'}));
    expect((await app.service.update('owner',row.id,{status:'IN_PROGRESS'})).completedAt).toBeNull();
    const first=await app.service.complete('owner',row.id); expect(first.completedAt).toBeInstanceOf(Date); app.advance();
    expect((await app.service.complete('owner',row.id)).completedAt).toEqual(first.completedAt);
    await expect(app.service.update('owner',row.id,{status:'CANCELLED'})).rejects.toMatchObject({status:409});
    expect((await app.service.reopen('owner',row.id)).completedAt).toBeNull();
    expect((await app.service.get('owner',row.id)).subtasks[0]?.completed).toBe(false);
    await app.service.update('owner',row.id,{status:'CANCELLED'});
    await expect(app.service.complete('owner',row.id)).rejects.toMatchObject({status:409});
    expect((await app.service.reopen('owner',row.id)).status).toBe('PENDING');
    const archived=await app.service.archive('owner',row.id); app.advance();
    expect((await app.service.archive('owner',row.id)).archivedAt).toEqual(archived.archivedAt);
    expect((await app.service.restore('owner',row.id)).archivedAt).toBeNull();
  });
  it('filters overdue using the user civil day; excludes undated/completed/cancelled tasks and orders priorities/null dates', async () => {
    const app=fake();
    expect(localToday(new Date('2026-11-13T01:00:00Z'),'America/Bahia')).toBe('2026-11-12');
    const late=await app.service.create('owner',createTaskDto.parse({title:'Film late',dueDate:'2026-11-11',priority:'URGENT'}));
    await app.service.create('owner',createTaskDto.parse({title:'Today',dueDate:'2026-11-12',priority:'LOW'}));
    await app.service.create('owner',createTaskDto.parse({title:'No date'}));
    await app.service.create('owner',createTaskDto.parse({title:'Done',status:'COMPLETED',dueDate:'2026-11-10'}));
    await app.service.create('owner',createTaskDto.parse({title:'Cancelled',status:'CANCELLED',dueDate:'2026-11-10'}));
    await app.service.create('other',createTaskDto.parse({title:'Foreign',dueDate:'2026-11-10'}));
    expect((await app.service.list('owner',taskQueryDto.parse({overdue:'true'}))).items.map((r)=>r.id)).toEqual([late.id]);
    expect((await app.service.list('owner',taskQueryDto.parse({withoutDueDate:'true'}))).items.map((r)=>r.title)).toEqual(['No date']);
    expect((await app.service.list('owner',taskQueryDto.parse({priority:'URGENT',status:'PENDING',q:'FILM',dueFrom:'2026-11-11',dueTo:'2026-11-11'}))).items).toHaveLength(1);
    expect((await app.service.list('owner',taskQueryDto.parse({sort:'priority',order:'desc',limit:'1'}))).items[0]?.priority).toBe('URGENT');
    expect((await app.service.list('owner',taskQueryDto.parse({sort:'dueDate',order:'desc'}))).items.at(-1)?.dueDate).toBeNull();
    expect((await app.service.list('owner',taskQueryDto.parse({limit:'2'}))).page.hasMore).toBe(true);
    expect((await app.service.list('owner',taskQueryDto.parse({limit:'2',page:'3'}))).page.hasMore).toBe(false);
    await app.service.archive('owner',late.id);
    expect((await app.service.list('owner',taskQueryDto.parse({overdue:'true'}))).items).toHaveLength(0);
    expect((await app.service.list('owner',taskQueryDto.parse({overdue:'true',includeArchived:'true'}))).items).toHaveLength(1);
  });
  it('creates, edits, completes, reopens, reorders and removes only the selected subtask', async () => {
    const app=fake();const row=await app.service.create('owner',createTaskDto.parse({title:'Task'}));
    const a=(await app.service.addSubtask('owner',row.id,createSubtaskDto.parse({title:'A'})))[0]!;
    const b=(await app.service.addSubtask('owner',row.id,createSubtaskDto.parse({title:'B'})))[1]!;
    expect((await app.service.updateSubtask('owner',row.id,a.id,{title:'Edited',completed:true}))[0]).toMatchObject({title:'Edited',completed:true});
    expect((await app.service.updateSubtask('owner',row.id,a.id,{completed:false}))[0]?.completed).toBe(false);
    for(const ids of [[a.id],[a.id,a.id],[a.id,randomUUID()]]) await expect(app.service.reorderSubtasks('owner',row.id,ids)).rejects.toMatchObject({status:400});
    expect(reorderSubtasksDto.safeParse({subtaskIds:[a.id,a.id]}).success).toBe(false);
    expect((await app.service.reorderSubtasks('owner',row.id,[b.id,a.id])).map((r)=>r.position)).toEqual([0,1]);
    expect((await app.service.removeSubtask('owner',row.id,b.id)).map((r)=>[r.id,r.position])).toEqual([[a.id,0]]);
    await expect(app.service.updateSubtask('owner',row.id,b.id,{title:'Gone'})).rejects.toMatchObject({status:404});
    expect((await app.service.get('owner',row.id)).subtasks).toHaveLength(1);
  });
});

it('all task/subtask HTTP routes enforce authentication, ownership and CSRF', async () => {
  const app=await setup(); const created=await app.request('','POST',{title:'Task'}); expect(created.status).toBe(201);
  const row=await created.json() as TaskRecord; expect(row.ownerId).toBe(app.ownerId); expect(row.dueDate).toBeNull(); expect(created.headers.get('location')).toBe('/tasks/'+row.id);
  const child=await app.request('/'+row.id+'/subtasks','POST',{title:'Child'}); expect(child.status).toBe(201);
  const {items}=await child.json() as {items:SubtaskRecord[]}; const sid=items[0]!.id;
  const actions: [string,string,unknown?][]=[['','GET'],['','POST',{title:'x'}],['/'+row.id,'GET'],['/'+row.id,'PATCH',{description:'x'}],...['complete','reopen','archive','restore'].map((action):[string,string]=>['/'+row.id+'/'+action,'POST']),['/'+row.id+'/subtasks','POST',{title:'x'}],['/'+row.id+'/subtasks/reorder','PATCH',{subtaskIds:[sid]}],['/'+row.id+'/subtasks/'+sid,'PATCH',{title:'x'}],['/'+row.id+'/subtasks/'+sid,'DELETE'],['/'+row.id+'/subtasks/'+sid+'/complete','POST'],['/'+row.id+'/subtasks/'+sid+'/reopen','POST']];
  const foreign=await app.service.create('other',createTaskDto.parse({title:'Private'}));
  for(const [path,method,body] of actions) {
    expect((await app.request(path,method,body,{} as typeof app.headers)).status).toBe(401);
    if(method!=='GET') expect((await app.request(path,method,body,{...app.headers,'X-CSRF-Token':''})).status).toBe(403);
    if(path.includes(row.id)) expect((await app.request(path.replace(row.id,foreign.id),method,body)).status).toBe(404);
  }
  for(const action of ['complete','reopen']) {
    expect((await app.request('/'+row.id+'/subtasks/'+sid+'/'+action,'POST')).status).toBe(200);
    expect((await app.request('/'+row.id+'/'+action,'POST')).status).toBe(200);
  }
  expect((await app.request('/'+row.id+'/subtasks/'+sid,'PATCH',{title:'New',completed:true})).status).toBe(200);
  expect((await app.request('/'+row.id+'/subtasks/reorder','PATCH',{subtaskIds:[sid]})).status).toBe(200);
  expect((await app.request('/'+row.id+'/subtasks/'+sid,'DELETE')).status).toBe(200);
  expect((await app.request('?limit=101')).status).toBe(400);
  expect((await app.request('','POST',{title:'x',ownerId:'attack'})).status).toBe(400);
  expect((await app.request('','POST',{title:'x'},{...app.headers,'Content-Type':'text/plain'})).status).toBe(415);
  expect((await app.request('/'+row.id+'/complete','POST',{completedAt:'fake'})).status).toBe(400);
});
it('Prisma queries bound results, scope every operation and order null deadlines last — mocked client', async () => {
  const task={findMany:vi.fn().mockResolvedValue([]),findFirst:vi.fn().mockResolvedValue(null),updateMany:vi.fn().mockResolvedValue({count:1}),findFirstOrThrow:vi.fn(),updateManyAndReturn:vi.fn()};
  const repo=createTaskRepository({task} as unknown as PrismaClient);
  await repo.list('owner',taskQueryDto.parse({overdue:'true',priority:'HIGH',sort:'dueDate',order:'asc',page:'2',limit:'5'}),'2026-11-12');
  expect(task.findMany).toHaveBeenCalledWith({where:{ownerId:'owner',archivedAt:null,priority:'HIGH',AND:{status:{in:['PENDING','IN_PROGRESS']}},dueDate:{lt:new Date('2026-11-12T00:00:00Z')}},orderBy:[{dueDate:{sort:'asc',nulls:'last'}},{id:'asc'}],skip:5,take:6});
  await repo.find('owner','id');expect(task.findFirst).toHaveBeenCalledWith({where:{id:'id',ownerId:'owner'}});
});
it('parent locking precedes subtask reads and denies external parents without touching children — mocked transaction', async () => {
  const tx={task:{updateMany:vi.fn().mockResolvedValue({count:1})},subtask:{findMany:vi.fn().mockResolvedValue([]),deleteMany:vi.fn(),create:vi.fn(),updateMany:vi.fn()}};
  const transaction=vi.fn(async(fn:(value:typeof tx)=>unknown)=>fn(tx));
  const repo=createTaskRepository({$transaction:transaction} as unknown as PrismaClient);
  await repo.mutateSubtasks('owner','id',(rows)=>rows);
  expect(tx.task.updateMany).toHaveBeenCalledWith({where:{id:'id',ownerId:'owner'},data:{updatedAt:expect.any(Date)}});
  expect(tx.task.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.subtask.findMany.mock.invocationCallOrder[0]!);
  tx.task.updateMany.mockResolvedValueOnce({count:0});tx.subtask.findMany.mockClear();
  await expect(repo.mutateSubtasks('other','id',(rows)=>rows)).rejects.toMatchObject({status:404});expect(tx.subtask.findMany).not.toHaveBeenCalled();
});
it('limits subtasks and rejects a child belonging to another own task', async () => {
  const app=fake();const a=await app.service.create('owner',createTaskDto.parse({title:'A'}));
  const b=await app.service.create('owner',createTaskDto.parse({title:'B'}));
  const foreign=(await app.service.addSubtask('owner',b.id,createSubtaskDto.parse({title:'B child'})))[0]!;
  await expect(app.service.updateSubtask('owner',a.id,foreign.id,{completed:true})).rejects.toMatchObject({status:404});
  await expect(app.service.removeSubtask('owner',a.id,foreign.id)).rejects.toMatchObject({status:404});
  for(let i=0;i<100;i++) await app.service.addSubtask('owner',a.id,createSubtaskDto.parse({title:'Child '+i}));
  await expect(app.service.addSubtask('owner',a.id,createSubtaskDto.parse({title:'Overflow'}))).rejects.toMatchObject({status:409,code:'SUBTASK_LIMIT'});
});
it('locks task updates, whitelists columns and does not mutate after invalid transitions — mocked transaction', async () => {
  const app=fake();const row=await app.service.create('owner',createTaskDto.parse({title:'Task'}));
  const tx={task:{updateMany:vi.fn().mockResolvedValue({count:1}),findFirstOrThrow:vi.fn().mockResolvedValue(row),updateManyAndReturn:vi.fn().mockResolvedValue([row])}};
  const repo=createTaskRepository({$transaction:async(fn:(client:typeof tx)=>unknown)=>fn(tx)} as unknown as PrismaClient);
  await repo.mutate('owner',row.id,(current)=>({...current,title:'Updated'}));
  expect(tx.task.updateMany).toHaveBeenCalledWith({where:{id:row.id,ownerId:'owner'},data:{updatedAt:expect.any(Date)}});
  expect(tx.task.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.task.findFirstOrThrow.mock.invocationCallOrder[0]!);
  const call=tx.task.updateManyAndReturn.mock.calls[0]![0];expect(call.data).not.toHaveProperty('ownerId');expect(call.data.title).toBe('Updated');
  tx.task.updateManyAndReturn.mockClear();
  await expect(repo.mutate('owner',row.id,()=>{throw new HttpError(409,'INVALID_TRANSITION','Denied');})).rejects.toMatchObject({status:409});
  expect(tx.task.updateManyAndReturn).not.toHaveBeenCalled();
});
