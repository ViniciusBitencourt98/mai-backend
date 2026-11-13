import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { ProjectService } from '../../src/services/project.service';
import type { ProjectRepository } from '../../src/repositories/project.repository';
import { createProjectDto, patchProjectDto, projectQueryDto, type ProjectRecord } from '../../src/projects/dto';
import { createProjectRepository } from '../../src/infra/database/project-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';

function fake() {
  const records = new Map<string, ProjectRecord>();
  const repository: ProjectRepository = {
    async create(ownerId, data) { const row = { ...data, id: randomUUID(), ownerId, createdAt: new Date(), updatedAt: new Date() }; records.set(row.id, row); return row; },
    async find(ownerId, id) { const row = records.get(id); return row?.ownerId === ownerId ? row : null; },
    async update(ownerId, id, data) { const row = await repository.find(ownerId, id); if (!row) return null; const next = { ...row, ...data, updatedAt: new Date() }; records.set(id, next); return next; },
    async list(ownerId, query) {
      return [...records.values()].filter((p) => p.ownerId === ownerId && (query.includeArchived || p.status === 'ACTIVE') && (!query.status || p.status === query.status) && (!query.q || p.name.toLowerCase().includes(query.q.toLowerCase())))
        .sort((a, b) => { const x = a[query.sort], y = b[query.sort]; const diff = x < y ? -1 : x > y ? 1 : 0; return diff ? diff * (query.order === 'asc' ? 1 : -1) : a.id.localeCompare(b.id); })
        .slice((query.page - 1) * query.limit, query.page * query.limit + 1);
    },
  };
  return { repository, records, service: new ProjectService(repository) };
}
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function setup() {
  const projects = fake(); const ownerId = randomUUID(); const token = newSessionToken();
  const auth = authRepositoryFake({ id: ownerId, name: 'Synthetic', email: 'test@example.invalid', passwordHash: 'unused', disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } });
  await auth.repository.issueSession({ userId: ownerId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000), now: new Date() });
  const settings = authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.example.invalid', CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const app = createApp('', { services: { auth: { settings, run: (fn) => fn(new AuthService(auth.repository)) }, projects: { run: (fn) => fn(projects.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const headers = { Cookie: settings.cookieName + '=' + token, Origin: 'https://app.example.invalid', 'X-CSRF-Token': csrfToken(token), 'Content-Type': 'application/json' };
  const request = (path = '', method = 'GET', body?: unknown, custom = headers) => fetch(`http://127.0.0.1:${address.port}/projects${path}`, { method, headers: custom, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ...projects, ownerId, headers, request };
}

describe('project DTOs', () => {
  it.each([{}, { name: '' }, { name: ' ' }, { name: 'x'.repeat(201) }, { name: 'ok', ownerId: randomUUID() }, { name: 'ok', status: 'BAD' }, { name: 'ok', color: 'red' }, { name: 'ok', startDate: '2026-02-30' }, { name: 'ok', dueDate: '2026-01-01T00:00:00Z' }])('rejects invalid create fields %j', (input) => { expect(createProjectDto.safeParse(input).success).toBe(false); });
  it('trims names, applies defaults and supports nullable optional fields', () => {
    expect(createProjectDto.parse({ name: ' Film ', description: null })).toEqual({ name: 'Film', description: null, status: 'ACTIVE' });
    expect(patchProjectDto.safeParse({}).success).toBe(false);
    expect(patchProjectDto.parse({ dueDate: null })).toEqual({ dueDate: null });
  });
  it.each([{ limit: '0' }, { limit: '101' }, { page: '-1' }, { page: '1.2' }, { limit: ['2', '3'] }, { includeArchived: 'yes' }, { sort: 'ownerId' }, { order: 'up' }, { status: 'bad' }, { extra: 'x' }])('rejects invalid list query %j', (query) => { expect(projectQueryDto.safeParse(query).success).toBe(false); });
});

describe('project service — isolated repository', () => {
  it('creates, partially updates, clears dates and validates merged dates', async () => {
    const { service } = fake();
    const row = await service.create('owner', createProjectDto.parse({ name: 'Film', startDate: '2026-01-01', dueDate: '2026-02-01' }));
    expect(row.ownerId).toBe('owner'); expect(row.status).toBe('ACTIVE');
    await expect(service.update('owner', row.id, { startDate: '2026-03-01' })).rejects.toMatchObject({ status: 400 });
    const next = await service.update('owner', row.id, { description: 'New', dueDate: null });
    expect(next.name).toBe('Film'); expect(next.dueDate).toBeNull();
    await expect(service.create('owner', createProjectDto.parse({ name: 'Invalid', startDate: '2026-03-01', dueDate: '2026-01-01' }))).rejects.toMatchObject({ status: 400 });
  });
  it('archives and restores idempotently, including PATCH status', async () => {
    const { service } = fake(); const row = await service.create('owner', createProjectDto.parse({ name: 'Film' }));
    const first = await service.archive('owner', row.id); const again = await service.archive('owner', row.id);
    expect(first.archivedAt).toEqual(again.archivedAt); expect(again.status).toBe('ARCHIVED');
    expect((await service.restore('owner', row.id)).archivedAt).toBeNull();
    expect((await service.restore('owner', row.id)).status).toBe('ACTIVE');
    expect((await service.update('owner', row.id, { status: 'ARCHIVED' })).archivedAt).toBeInstanceOf(Date);
  });
  it('limits pages, filters names/status/owner, excludes archived by default', async () => {
    const { service } = fake();
    for (const name of ['Beta', 'Alpha', 'Gamma']) await service.create('owner', createProjectDto.parse({ name }));
    await service.create('other', createProjectDto.parse({ name: 'Alien' }));
    await service.create('owner', createProjectDto.parse({ name: 'Archived', status: 'ARCHIVED' }));
    const first = await service.list('owner', projectQueryDto.parse({ limit: '2', sort: 'name', order: 'asc' }));
    expect(first.items.map((p) => p.name)).toEqual(['Alpha', 'Beta']); expect(first.page.hasMore).toBe(true);
    const last = await service.list('owner', projectQueryDto.parse({ limit: '2', page: '2', sort: 'name', order: 'asc' }));
    expect(last.items.map((p) => p.name)).toEqual(['Gamma']); expect(last.page.hasMore).toBe(false);
    expect((await service.list('owner', projectQueryDto.parse({ q: 'ALP' }))).items).toHaveLength(1);
    expect((await service.list('owner', projectQueryDto.parse({ status: 'ARCHIVED' }))).items).toHaveLength(0);
    expect((await service.list('owner', projectQueryDto.parse({ status: 'ARCHIVED', includeArchived: 'true' }))).items).toHaveLength(1);
  });
});

describe('project HTTP — isolated persistence, not Neon integration', () => {
  it('creates, reads, patches, archives and restores with the authenticated owner', async () => {
    const app = await setup(); const created = await app.request('', 'POST', { name: 'Film', color: '#00aAff', startDate: '2026-11-13' });
    expect(created.status).toBe(201); const row = await created.json() as ProjectRecord;
    expect(created.headers.get('location')).toBe('/projects/' + row.id); expect(row.ownerId).toBe(app.ownerId); expect(row.startDate).toBe('2026-11-13');
    expect((await app.request('/' + row.id)).status).toBe(200);
    expect((await app.request('/' + row.id, 'PATCH', { name: 'Edited', description: null })).status).toBe(200);
    expect((await app.request('/' + row.id + '/archive', 'POST')).status).toBe(200);
    expect(await (await app.request()).json()).toMatchObject({ items: [], page: { number: 1, limit: 20, hasMore: false } });
    expect((await app.request('/' + row.id + '/restore', 'POST', {})).status).toBe(200);
    expect((await app.request()).headers.get('cache-control')).toBe('no-store');
  });
  it('rejects unauthenticated access on every endpoint before persistence', async () => {
    const app = await setup(); const id = randomUUID();
    for (const [path, method] of [['', 'GET'], ['', 'POST'], ['/' + id, 'GET'], ['/' + id, 'PATCH'], ['/' + id + '/archive', 'POST'], ['/' + id + '/restore', 'POST']]) {
      expect((await app.request(path, method, undefined, {} as typeof app.headers)).status).toBe(401);
    }
    expect(app.records.size).toBe(0);
  });
  it('returns indistinguishable 404 for another owner and missing IDs in every operation', async () => {
    const app = await setup(); const foreign = await app.service.create(randomUUID(), createProjectDto.parse({ name: 'Private' }));
    for (const id of [foreign.id, randomUUID()]) for (const [suffix, method, body] of [['', 'GET', undefined], ['', 'PATCH', { name: 'Attack' }], ['/archive', 'POST', undefined], ['/restore', 'POST', undefined]] as const) {
      const response = await app.request('/' + id + suffix, method, body); expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }
    expect(app.records.get(foreign.id)?.name).toBe('Private');
    expect(await (await app.request()).json()).toMatchObject({ items: [] });
  });
  it('enforces strict input, JSON media, IDs, query limits, CSRF and credentialed CORS', async () => {
    const app = await setup();
    expect((await app.request('', 'POST', { name: 'x', ownerId: randomUUID() })).status).toBe(400);
    expect((await app.request('/?limit=101')).status).toBe(400);
    expect((await app.request('/not-a-uuid')).status).toBe(400);
    expect((await app.request('', 'POST', { name: 'x' }, { ...app.headers, 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await app.request('', 'POST', { name: 'x' }, { ...app.headers, 'X-CSRF-Token': '' })).status).toBe(403);
    expect((await app.request('', 'POST', { name: 'x' }, { ...app.headers, Origin: '' })).status).toBe(403);
    const response = await app.request('', 'OPTIONS', undefined, { ...app.headers, 'Access-Control-Request-Method': 'PATCH' } as typeof app.headers);
    expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
  });
});

it('Prisma repository scopes every operation, bounds queries and uses stable order — mock client only', async () => {
  const project = { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), updateManyAndReturn: vi.fn().mockResolvedValue([]) };
  const repository = createProjectRepository({ project } as unknown as PrismaClient);
  await repository.list('owner', projectQueryDto.parse({ page: '2', limit: '5', q: 'Film', status: 'ARCHIVED', includeArchived: 'true', sort: 'name', order: 'asc' }));
  expect(project.findMany).toHaveBeenCalledWith({ where: { ownerId: 'owner', AND: { status: 'ARCHIVED' }, name: { contains: 'Film', mode: 'insensitive' } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: 5, take: 6 });
  await repository.find('owner', 'id'); expect(project.findFirst).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' } });
  expect(await repository.update('owner', 'id', { name: 'New' })).toBeNull();
  expect(project.updateManyAndReturn).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' }, data: { name: 'New' } });
});
