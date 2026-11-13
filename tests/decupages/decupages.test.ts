import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { DecupageService } from '../../src/services/decupage.service';
import type { DecupageRepository } from '../../src/repositories/decupage.repository';
import { createDecupageDto, patchDecupageDto, decupageQueryDto, type DecupageRecord } from '../../src/decupages/dto';
import { createDecupageRepository } from '../../src/infra/database/decupage-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';

import { HttpError } from '../../src/errors/http-error';
import { createSegmentDto, patchSegmentDto, reorderSegmentsDto, type SegmentRecord } from '../../src/decupages/dto';

function fake() {
  const segments = new Map<string, SegmentRecord[]>();
  const records = new Map<string, DecupageRecord>();
  const projects = new Map<string, string>();
  const repository: DecupageRepository = {
    async listSegments(ownerId, id) { return await repository.find(ownerId, id) ? segments.get(id) ?? [] : null; },
    async mutateSegments(ownerId, id, operation) {
      if (!await repository.find(ownerId, id)) throw new HttpError(404, 'NOT_FOUND', 'Decupage not found');
      const next = operation(structuredClone(segments.get(id) ?? []));
      segments.set(id, next); return next;
    },
    async create(ownerId, data) { const row = { ...data, id: randomUUID(), ownerId, createdAt: new Date(), updatedAt: new Date(), archivedAt: null }; records.set(row.id, row); return row; },
    async find(ownerId, id) { const row = records.get(id); return row?.ownerId === ownerId ? row : null; },
    async ownsProject(ownerId, id) { return projects.get(id) === ownerId; },
    async update(ownerId, id, data) { const row = await repository.find(ownerId, id); if (!row) return null; const next = { ...row, ...data }; records.set(id, next); return next; },
    async setArchived(ownerId, id, at) { const row = await repository.find(ownerId, id); if (!row) return null; row.archivedAt = at ? row.archivedAt ?? at : null; return { ...row }; },
    async list(ownerId, query) {
      return [...records.values()].filter((p) => p.ownerId === ownerId && (query.includeArchived || !p.archivedAt) && (!query.q || p.title.toLowerCase().includes(query.q.toLowerCase())) && (!query.tag || p.tags.includes(query.tag)) && (!query.projectId || p.projectId === query.projectId) && (!query.withoutProject || p.projectId === null))
        .sort((a, b) => (a[query.sort].getTime() - b[query.sort].getTime()) * (query.order === 'asc' ? 1 : -1) || a.id.localeCompare(b.id))
        .slice((query.page - 1) * query.limit, query.page * query.limit + 1);
    },
  };
  return { repository, records, projects, segments, service: new DecupageService(repository) };
}
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function setup() {
  const decupages = fake(); const ownerId = randomUUID(); const token = newSessionToken();
  const auth = authRepositoryFake({ id: ownerId, name: 'Synthetic', email: 'test@example.invalid', passwordHash: 'unused', disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } });
  await auth.repository.issueSession({ userId: ownerId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000), now: new Date() });
  const settings = authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.example.invalid', CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const app = createApp('', { services: { auth: { settings, run: (fn) => fn(new AuthService(auth.repository)) }, decupages: { run: (fn) => fn(decupages.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const headers = { Cookie: settings.cookieName + '=' + token, Origin: 'https://app.example.invalid', 'X-CSRF-Token': csrfToken(token), 'Content-Type': 'application/json' };
  const request = (path = '', method = 'GET', body?: unknown, custom = headers) => fetch(`http://127.0.0.1:${address.port}/decupages${path}`, { method, headers: custom, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ...decupages, ownerId, headers, request };
}


describe('decupage validation', () => {
  it.each([{}, { title: '' }, { title: ' ' }, { title: 'x'.repeat(201) }, { title: 'ok', description: 'x'.repeat(50001) }, { title: 'ok', tags: [''] }, { title: 'ok', tags: Array(21).fill('tag') }, { title: 'ok', tags: ['x'.repeat(51)] }, { title: 'ok', projectId: 'invalid' }, { title: 'ok', ownerId: randomUUID() }])('rejects invalid input %j', (input) => { expect(createDecupageDto.safeParse(input).success).toBe(false); });
  it('defaults independent decupages and normalizes/deduplicates tags', () => {
    expect(createDecupageDto.parse({ title: ' Idea ' })).toEqual({ title: 'Idea', description: null, tags: [], projectId: null });
    expect(createDecupageDto.parse({ title: 'x', tags: [' Film ', 'film', 'MAI'] }).tags).toEqual(['film', 'mai']);
    expect(patchDecupageDto.safeParse({}).success).toBe(false);
    expect(patchDecupageDto.safeParse({ archivedAt: null }).success).toBe(false);
  });
  it.each([{ limit: '101' }, { page: '0' }, { page: '1.1' }, { q: ['a', 'b'] }, { includeArchived: 'yes' }, { tag: '' }, { projectId: randomUUID(), withoutProject: 'true' }, { sort: 'title' }, { order: 'bad' }, { unknown: 'value' }])('rejects query %j', (input) => { expect(decupageQueryDto.safeParse(input).success).toBe(false); });
});
describe('decupages service with isolated repository', () => {
  it('creates without a project, links owned projects, updates description/tags and detaches without data loss', async () => {
    const app = fake(); const projectId = randomUUID(); app.projects.set(projectId, 'owner');
    const row = await app.service.create('owner', createDecupageDto.parse({ title: 'Idea' }));
    expect(row.projectId).toBeNull(); expect(row.description).toBeNull();
    const updated = await app.service.update('owner', row.id, patchDecupageDto.parse({ description: 'Plain text <b>only</b>', projectId, tags: [' MAI ', 'film'] }));
    expect(updated).toMatchObject({ description: 'Plain text <b>only</b>', projectId, tags: ['mai', 'film'] });
    const detached = await app.service.update('owner', row.id, { projectId: null, tags: [] });
    expect(detached).toMatchObject({ projectId: null, tags: [], title: 'Idea', description: updated.description });
    expect((await app.service.create('owner', createDecupageDto.parse({ title: 'Linked', projectId }))).projectId).toBe(projectId);
  });
  it('rejects missing and foreign projects with identical errors and no write', async () => {
    const app = fake(); const foreign = randomUUID(); app.projects.set(foreign, 'other');
    const row = await app.service.create('owner', createDecupageDto.parse({ title: 'Idea' }));
    for (const projectId of [foreign, randomUUID()]) {
      await expect(app.service.create('owner', createDecupageDto.parse({ title: 'Attack', projectId }))).rejects.toMatchObject({ status: 404, message: 'Project not found' });
      await expect(app.service.update('owner', row.id, { projectId })).rejects.toMatchObject({ status: 404, message: 'Project not found' });
    }
    expect(app.records.size).toBe(1); expect(app.records.get(row.id)?.projectId).toBeNull();
  });
  it('archives/restores idempotently and filters title, tag, project, unlinked, pages and owner', async () => {
    const app = fake(); const projectId = randomUUID(); app.projects.set(projectId, 'owner');
    const row = await app.service.create('owner', createDecupageDto.parse({ title: 'Film idea', projectId, tags: ['film'] }));
    await app.service.create('owner', createDecupageDto.parse({ title: 'Other' }));
    await app.service.create('other', createDecupageDto.parse({ title: 'Secret', tags: ['film'] }));
    expect((await app.service.list('owner', decupageQueryDto.parse({ q: 'FILM', tag: 'Film', projectId }))).items.map((n) => n.id)).toEqual([row.id]);
    expect((await app.service.list('owner', decupageQueryDto.parse({ withoutProject: 'true' }))).items).toHaveLength(1);
    const page = await app.service.list('owner', decupageQueryDto.parse({ limit: '1', sort: 'createdAt', order: 'asc' }));
    expect(page.items).toHaveLength(1); expect(page.page.hasMore).toBe(true);
    expect((await app.service.list('owner', decupageQueryDto.parse({ limit: '1', page: '2' }))).page.hasMore).toBe(false);
    const archived = await app.service.archive('owner', row.id);
    expect((await app.service.archive('owner', row.id)).archivedAt).toEqual(archived.archivedAt);
    expect((await app.service.list('owner', decupageQueryDto.parse({}))).items).toHaveLength(1);
    expect((await app.service.list('owner', decupageQueryDto.parse({ includeArchived: 'true' }))).items).toHaveLength(2);
    expect((await app.service.get('owner', row.id)).archivedAt).not.toBeNull();
    expect((await app.service.restore('owner', row.id)).archivedAt).toBeNull();
    expect((await app.service.restore('owner', row.id)).projectId).toBe(projectId);
  });
});
describe('decupages HTTP — isolated persistence, not PostgreSQL integration', () => {
  it('supports all six endpoints with credentialed CORS and rejects owner injection', async () => {
    const app = await setup();
    expect((await app.request('', 'POST', { title: 'Idea', ownerId: randomUUID() })).status).toBe(400);
    const created = await app.request('', 'POST', { title: 'Idea' }); expect(created.status).toBe(201);
    const row = await created.json() as DecupageRecord;
    expect(row).toMatchObject({ ownerId: app.ownerId, projectId: null, description: null, tags: [] });
    expect(created.headers.get('location')).toBe('/decupages/' + row.id);
    expect((await app.request('/' + row.id)).status).toBe(200);
    expect((await app.request('/' + row.id, 'PATCH', { description: 'Updated', tags: ['new'] })).status).toBe(200);
    expect((await app.request('/' + row.id + '/archive', 'POST')).status).toBe(200);
    expect((await app.request('/' + row.id + '/restore', 'POST', {})).status).toBe(200);
    expect(await (await app.request('?tag=new')).json()).toMatchObject({ items: [{ title: 'Idea', description: 'Updated', tags: ['new'] }], page: { limit: 20, hasMore: false } });
    const cors = await app.request('', 'OPTIONS', undefined, { ...app.headers, 'Access-Control-Request-Method': 'PATCH' } as typeof app.headers);
    expect(cors.headers.get('access-control-allow-credentials')).toBe('true'); expect(cors.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(created.headers.get('cache-control')).toBe('no-store');
  });
  it('requires authentication for every endpoint and hides other owners in every operation', async () => {
    const app = await setup(); const foreign = await app.service.create('other', createDecupageDto.parse({ title: 'Secret' }));
    for (const [path, method] of [['', 'GET'], ['', 'POST'], ['/' + foreign.id, 'GET'], ['/' + foreign.id, 'PATCH'], ['/' + foreign.id + '/archive', 'POST'], ['/' + foreign.id + '/restore', 'POST']]) {
      expect((await app.request(path, method, undefined, {} as typeof app.headers)).status).toBe(401);
    }
    for (const id of [foreign.id, randomUUID()]) for (const [suffix, method, body] of [['', 'GET', undefined], ['', 'PATCH', { title: 'Attack' }], ['/archive', 'POST', undefined], ['/restore', 'POST', undefined]] as const) {
      const response = await app.request('/' + id + suffix, method, body); expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Decupage not found' } });
    }
    expect(await (await app.request()).json()).toMatchObject({ items: [] });
    expect(app.records.get(foreign.id)?.title).toBe('Secret');
  });
  it('validates links, queries, body/media and CSRF before mutations', async () => {
    const app = await setup(); const foreign = randomUUID(); app.projects.set(foreign, 'other');
    expect((await app.request('', 'POST', { title: 'x', projectId: foreign })).status).toBe(404);
    expect((await app.request('?limit=101')).status).toBe(400);
    expect((await app.request('/invalid')).status).toBe(400);
    expect((await app.request('', 'POST', { title: 'x' }, { ...app.headers, 'Content-Type': 'text/plain' })).status).toBe(415);
    for (const patch of [{ Origin: '' }, { 'X-CSRF-Token': '' }]) expect((await app.request('', 'POST', { title: 'x' }, { ...app.headers, ...patch })).status).toBe(403);
    const projectId = randomUUID(); app.projects.set(projectId, app.ownerId);
    const created = await app.request('', 'POST', { title: 'x', projectId }); expect(created.status).toBe(201);
    const row = await created.json() as DecupageRecord;
    expect((await app.request('/' + row.id, 'PATCH', { projectId: null })).status).toBe(200);
    expect((await app.request('/' + row.id + '/archive', 'POST', { ownerId: 'injected' })).status).toBe(400);
    expect((await app.request('/' + row.id + '/archive', 'POST', [])).status).toBe(400);
    expect((await app.request('/' + row.id, 'PATCH', {})).status).toBe(400);
  });
});
it('Prisma predicates scope every read/write and validate project ownership — mocked client only', async () => {
  const decupage = { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), updateManyAndReturn: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) };
  const project = { findFirst: vi.fn().mockResolvedValue(null) };
  const repository = createDecupageRepository({ decupage, project } as unknown as PrismaClient);
  await repository.list('owner', decupageQueryDto.parse({ page: '2', limit: '5', tag: 'Film', withoutProject: 'true' }));
  expect(decupage.findMany).toHaveBeenCalledWith({ where: { ownerId: 'owner', archivedAt: null, tags: { has: 'film' }, projectId: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: 5, take: 6 });
  await repository.list('owner', decupageQueryDto.parse({ q: '100%' }));
  expect(decupage.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'owner', OR: expect.arrayContaining([{ title: { contains: '100\\%', mode: 'insensitive' } }, { segments: { some: { description: { contains: '100\\%', mode: 'insensitive' } } } }]) }) }));
  await repository.ownsProject('owner', 'project'); expect(project.findFirst).toHaveBeenCalledWith({ where: { id: 'project', ownerId: 'owner' }, select: { id: true } });
  await repository.update('owner', 'id', { projectId: null }); expect(decupage.updateManyAndReturn).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' }, data: { projectId: null } });
  const at = new Date(); await repository.setArchived('owner', 'id', at);
  expect(decupage.updateMany).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner', archivedAt: null }, data: { archivedAt: at } });
  expect(decupage.findFirst).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' } });
  decupage.create.mockRejectedValueOnce({ code: 'P2003' });
  await expect(repository.create('owner', { title: 'x', description: null, tags: [], projectId: 'gone' })).rejects.toMatchObject({ status: 404, message: 'Project not found' });
});

describe('segment timecodes and operations — isolated repository', () => {
  it.each([-1, 1.5, 2147483648, '1000', null])('rejects startMs=%j', (startMs) => {
    expect(createSegmentDto.safeParse({ startMs }).success).toBe(false);
  });
  it('validates endMs, rejects empty updates/duplicate reorder IDs and accepts boundary offsets', () => {
    expect(createSegmentDto.parse({ startMs: 2147483647, endMs: 2147483647 }).startMs).toBe(2147483647);
    expect(createSegmentDto.safeParse({ startMs: 0, endMs: -1 }).success).toBe(false);
    expect(patchSegmentDto.safeParse({}).success).toBe(false);
    const id = randomUUID(); expect(reorderSegmentsDto.safeParse({ segmentIds: [id, id] }).success).toBe(false);
    expect(createSegmentDto.safeParse({ startMs: 0, position: 1 }).success).toBe(false);
  });
  it('appends, edits, reorders and removes without gaps, validating merged timecodes and exact membership', async () => {
    const app = fake(); const parent = await app.service.create('owner', createDecupageDto.parse({ title: 'Film' }));
    expect((await app.service.get('owner', parent.id)).segments).toEqual([]);
    await expect(app.service.addSegment('owner', parent.id, { startMs: 10, endMs: 9, description: '' })).rejects.toMatchObject({ status: 400 });
    const a = (await app.service.addSegment('owner', parent.id, createSegmentDto.parse({ startMs: 100, endMs: 200 })))[0]!;
    const all = await app.service.addSegment('owner', parent.id, createSegmentDto.parse({ startMs: 0, description: 'Opening' })); const b = all[1]!;
    expect(all.map((s) => s.position)).toEqual([0, 1]);
    await expect(app.service.updateSegment('owner', parent.id, a.id, { startMs: 201 })).rejects.toMatchObject({ status: 400 });
    expect((await app.service.updateSegment('owner', parent.id, a.id, { endMs: null, description: 'Changed' }))[0]?.description).toBe('Changed');
    for (const ids of [[a.id], [a.id, a.id], [a.id, randomUUID()]]) {
      await expect(app.service.reorderSegments('owner', parent.id, ids)).rejects.toMatchObject({ status: 400 });
      expect(app.segments.get(parent.id)?.map((s) => s.id)).toEqual([a.id, b.id]);
    }
    const ordered = await app.service.reorderSegments('owner', parent.id, [b.id, a.id]);
    expect(ordered.map((s) => [s.id, s.position])).toEqual([[b.id, 0], [a.id, 1]]);
    await app.service.archive('owner', parent.id);
    expect((await app.service.get('owner', parent.id)).segments.map((s) => s.id)).toEqual([b.id, a.id]);
    await app.service.restore('owner', parent.id);
    expect((await app.service.removeSegment('owner', parent.id, b.id)).map((s) => [s.id, s.position])).toEqual([[a.id, 0]]);
    expect(await app.service.removeSegment('owner', parent.id, a.id)).toEqual([]);
    expect(await app.service.reorderSegments('owner', parent.id, [])).toEqual([]);
  });
  it('rejects external parents and unrelated segments for all segment operations', async () => {
    const app = fake(); const a = await app.service.create('owner', createDecupageDto.parse({ title: 'Own' }));
    const b = await app.service.create('other', createDecupageDto.parse({ title: 'Foreign' }));
    const segment = (await app.service.addSegment('other', b.id, createSegmentDto.parse({ startMs: 0 })))[0]!;
    for (const parentId of [b.id, randomUUID()]) {
      await expect(app.service.addSegment('owner', parentId, createSegmentDto.parse({ startMs: 0 }))).rejects.toMatchObject({ status: 404 });
      await expect(app.service.updateSegment('owner', parentId, segment.id, { description: 'Attack' })).rejects.toMatchObject({ status: 404 });
      await expect(app.service.removeSegment('owner', parentId, segment.id)).rejects.toMatchObject({ status: 404 });
      await expect(app.service.reorderSegments('owner', parentId, [segment.id])).rejects.toMatchObject({ status: 404 });
    }
    await expect(app.service.updateSegment('owner', a.id, segment.id, { startMs: 0 })).rejects.toMatchObject({ status: 404 });
    await expect(app.service.removeSegment('owner', a.id, segment.id)).rejects.toMatchObject({ status: 404 });
  });
  it('bounds segment collection at 100', async () => {
    const app = fake(); const row = await app.service.create('owner', createDecupageDto.parse({ title: 'Film' }));
    for (let i = 0; i < 100; i++) await app.service.addSegment('owner', row.id, createSegmentDto.parse({ startMs: i }));
    await expect(app.service.addSegment('owner', row.id, createSegmentDto.parse({ startMs: 0 }))).rejects.toMatchObject({ status: 409, code: 'SEGMENT_LIMIT' });
  });
});
it('segment HTTP supports creation/edit/delete/reorder and applies authentication and CSRF', async () => {
  const app = await setup(); const parent = await app.service.create(app.ownerId, createDecupageDto.parse({ title: 'Film' }));
  const path = '/' + parent.id + '/segments';
  for (const [suffix, method, body] of [['', 'POST', { startMs: 0 }], ['/reorder', 'PATCH', { segmentIds: [] }], ['/' + randomUUID(), 'PATCH', { startMs: 0 }], ['/' + randomUUID(), 'DELETE', undefined]] as const) {
    expect((await app.request(path + suffix, method, body, {} as typeof app.headers)).status).toBe(401);
    expect((await app.request(path + suffix, method, body, { ...app.headers, 'X-CSRF-Token': '' })).status).toBe(403);
  }
  expect((await app.request(path, 'POST', { startMs: -1 })).status).toBe(400);
  const created = await app.request(path, 'POST', { startMs: 100, endMs: 200 }); expect(created.status).toBe(201);
  const { items } = await created.json() as { items: SegmentRecord[] }; const id = items[0]!.id;
  expect((await app.request(path + '/' + id, 'PATCH', { endMs: 99 })).status).toBe(400);
  expect((await app.request(path + '/' + id, 'PATCH', { endMs: null })).status).toBe(200);
  expect((await app.request(path + '/reorder', 'PATCH', { segmentIds: [id] })).status).toBe(200);
  const detail = await (await app.request('/' + parent.id)).json() as { segments: SegmentRecord[] }; expect(detail.segments[0]?.id).toBe(id);
  const removed = await app.request(path + '/' + id, 'DELETE'); expect(removed.status).toBe(200); expect(await removed.json()).toEqual({ items: [] });
  const external = await app.service.create('other', createDecupageDto.parse({ title: 'Private' }));
  expect((await app.request('/' + external.id + '/segments', 'POST', { startMs: 0 })).status).toBe(404);
});
it('Prisma segment transaction locks the scoped parent before reading or writing — mocked transaction', async () => {
  const tx = { decupage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, decupageSegment: {
    findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn(), updateMany: vi.fn(),
  } };
  const transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx));
  const repo = createDecupageRepository({ $transaction: transaction } as unknown as PrismaClient);
  await repo.mutateSegments('owner', 'parent', (rows) => rows);
  expect(tx.decupage.updateMany).toHaveBeenCalledWith({ where: { id: 'parent', ownerId: 'owner' }, data: { updatedAt: expect.any(Date) } });
  expect(tx.decupage.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.decupageSegment.findMany.mock.invocationCallOrder[0]!);
  tx.decupage.updateMany.mockResolvedValueOnce({ count: 0 }); tx.decupageSegment.findMany.mockClear();
  await expect(repo.mutateSegments('other', 'parent', (rows) => rows)).rejects.toMatchObject({ status: 404 });
  expect(tx.decupageSegment.findMany).not.toHaveBeenCalled();
});
