import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { NoteService } from '../../src/services/note.service';
import type { NoteRepository } from '../../src/repositories/note.repository';
import { createNoteDto, patchNoteDto, noteQueryDto, type NoteRecord } from '../../src/notes/dto';
import { createNoteRepository } from '../../src/infra/database/note-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';

function fake() {
  const records = new Map<string, NoteRecord>();
  const projects = new Map<string, string>();
  const repository: NoteRepository = {
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
  return { repository, records, projects, service: new NoteService(repository) };
}
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function setup() {
  const notes = fake(); const ownerId = randomUUID(); const token = newSessionToken();
  const auth = authRepositoryFake({ id: ownerId, name: 'Synthetic', email: 'test@example.invalid', passwordHash: 'unused', disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } });
  await auth.repository.issueSession({ userId: ownerId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000), now: new Date() });
  const settings = authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.example.invalid', CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const app = createApp('', { services: { auth: { settings, run: (fn) => fn(new AuthService(auth.repository)) }, notes: { run: (fn) => fn(notes.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const headers = { Cookie: settings.cookieName + '=' + token, Origin: 'https://app.example.invalid', 'X-CSRF-Token': csrfToken(token), 'Content-Type': 'application/json' };
  const request = (path = '', method = 'GET', body?: unknown, custom = headers) => fetch(`http://127.0.0.1:${address.port}/notes${path}`, { method, headers: custom, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ...notes, ownerId, headers, request };
}


describe('note validation', () => {
  it.each([{}, { title: '' }, { title: ' ' }, { title: 'x'.repeat(201) }, { title: 'ok', content: null }, { title: 'ok', content: 'x'.repeat(50001) }, { title: 'ok', tags: [''] }, { title: 'ok', tags: Array(21).fill('tag') }, { title: 'ok', tags: ['x'.repeat(51)] }, { title: 'ok', projectId: 'invalid' }, { title: 'ok', ownerId: randomUUID() }])('rejects invalid input %j', (input) => { expect(createNoteDto.safeParse(input).success).toBe(false); });
  it('defaults independent notes and normalizes/deduplicates tags', () => {
    expect(createNoteDto.parse({ title: ' Idea ' })).toEqual({ title: 'Idea', content: '', tags: [], projectId: null });
    expect(createNoteDto.parse({ title: 'x', tags: [' Film ', 'film', 'MAI'] }).tags).toEqual(['film', 'mai']);
    expect(patchNoteDto.safeParse({}).success).toBe(false);
    expect(patchNoteDto.safeParse({ archivedAt: null }).success).toBe(false);
  });
  it.each([{ limit: '101' }, { page: '0' }, { page: '1.1' }, { q: ['a', 'b'] }, { includeArchived: 'yes' }, { tag: '' }, { projectId: randomUUID(), withoutProject: 'true' }, { sort: 'title' }, { order: 'bad' }, { unknown: 'value' }])('rejects query %j', (input) => { expect(noteQueryDto.safeParse(input).success).toBe(false); });
});
describe('notes service with isolated repository', () => {
  it('creates without a project, links owned projects, updates content/tags and detaches without data loss', async () => {
    const app = fake(); const projectId = randomUUID(); app.projects.set(projectId, 'owner');
    const row = await app.service.create('owner', createNoteDto.parse({ title: 'Idea' }));
    expect(row.projectId).toBeNull(); expect(row.content).toBe('');
    const updated = await app.service.update('owner', row.id, patchNoteDto.parse({ content: 'Plain text <b>only</b>', projectId, tags: [' MAI ', 'film'] }));
    expect(updated).toMatchObject({ content: 'Plain text <b>only</b>', projectId, tags: ['mai', 'film'] });
    const detached = await app.service.update('owner', row.id, { projectId: null, tags: [] });
    expect(detached).toMatchObject({ projectId: null, tags: [], title: 'Idea', content: updated.content });
    expect((await app.service.create('owner', createNoteDto.parse({ title: 'Linked', projectId }))).projectId).toBe(projectId);
  });
  it('rejects missing and foreign projects with identical errors and no write', async () => {
    const app = fake(); const foreign = randomUUID(); app.projects.set(foreign, 'other');
    const row = await app.service.create('owner', createNoteDto.parse({ title: 'Idea' }));
    for (const projectId of [foreign, randomUUID()]) {
      await expect(app.service.create('owner', createNoteDto.parse({ title: 'Attack', projectId }))).rejects.toMatchObject({ status: 404, message: 'Project not found' });
      await expect(app.service.update('owner', row.id, { projectId })).rejects.toMatchObject({ status: 404, message: 'Project not found' });
    }
    expect(app.records.size).toBe(1); expect(app.records.get(row.id)?.projectId).toBeNull();
  });
  it('archives/restores idempotently and filters title, tag, project, unlinked, pages and owner', async () => {
    const app = fake(); const projectId = randomUUID(); app.projects.set(projectId, 'owner');
    const row = await app.service.create('owner', createNoteDto.parse({ title: 'Film idea', projectId, tags: ['film'] }));
    await app.service.create('owner', createNoteDto.parse({ title: 'Other' }));
    await app.service.create('other', createNoteDto.parse({ title: 'Secret', tags: ['film'] }));
    expect((await app.service.list('owner', noteQueryDto.parse({ q: 'FILM', tag: 'Film', projectId }))).items.map((n) => n.id)).toEqual([row.id]);
    expect((await app.service.list('owner', noteQueryDto.parse({ withoutProject: 'true' }))).items).toHaveLength(1);
    const page = await app.service.list('owner', noteQueryDto.parse({ limit: '1', sort: 'createdAt', order: 'asc' }));
    expect(page.items).toHaveLength(1); expect(page.page.hasMore).toBe(true);
    expect((await app.service.list('owner', noteQueryDto.parse({ limit: '1', page: '2' }))).page.hasMore).toBe(false);
    const archived = await app.service.archive('owner', row.id);
    expect((await app.service.archive('owner', row.id)).archivedAt).toEqual(archived.archivedAt);
    expect((await app.service.list('owner', noteQueryDto.parse({}))).items).toHaveLength(1);
    expect((await app.service.list('owner', noteQueryDto.parse({ includeArchived: 'true' }))).items).toHaveLength(2);
    expect((await app.service.get('owner', row.id)).archivedAt).not.toBeNull();
    expect((await app.service.restore('owner', row.id)).archivedAt).toBeNull();
    expect((await app.service.restore('owner', row.id)).projectId).toBe(projectId);
  });
});
describe('notes HTTP — isolated persistence, not PostgreSQL integration', () => {
  it('supports all six endpoints with credentialed CORS and rejects owner injection', async () => {
    const app = await setup();
    expect((await app.request('', 'POST', { title: 'Idea', ownerId: randomUUID() })).status).toBe(400);
    const created = await app.request('', 'POST', { title: 'Idea' }); expect(created.status).toBe(201);
    const row = await created.json() as NoteRecord;
    expect(row).toMatchObject({ ownerId: app.ownerId, projectId: null, content: '', tags: [] });
    expect(created.headers.get('location')).toBe('/notes/' + row.id);
    expect((await app.request('/' + row.id)).status).toBe(200);
    expect((await app.request('/' + row.id, 'PATCH', { content: 'Updated', tags: ['new'] })).status).toBe(200);
    expect((await app.request('/' + row.id + '/archive', 'POST')).status).toBe(200);
    expect((await app.request('/' + row.id + '/restore', 'POST', {})).status).toBe(200);
    expect(await (await app.request('?tag=new')).json()).toMatchObject({ items: [{ title: 'Idea', content: 'Updated', tags: ['new'] }], page: { limit: 20, hasMore: false } });
    const cors = await app.request('', 'OPTIONS', undefined, { ...app.headers, 'Access-Control-Request-Method': 'PATCH' } as typeof app.headers);
    expect(cors.headers.get('access-control-allow-credentials')).toBe('true'); expect(cors.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(created.headers.get('cache-control')).toBe('no-store');
  });
  it('requires authentication for every endpoint and hides other owners in every operation', async () => {
    const app = await setup(); const foreign = await app.service.create('other', createNoteDto.parse({ title: 'Secret' }));
    for (const [path, method] of [['', 'GET'], ['', 'POST'], ['/' + foreign.id, 'GET'], ['/' + foreign.id, 'PATCH'], ['/' + foreign.id + '/archive', 'POST'], ['/' + foreign.id + '/restore', 'POST']]) {
      expect((await app.request(path, method, undefined, {} as typeof app.headers)).status).toBe(401);
    }
    for (const id of [foreign.id, randomUUID()]) for (const [suffix, method, body] of [['', 'GET', undefined], ['', 'PATCH', { title: 'Attack' }], ['/archive', 'POST', undefined], ['/restore', 'POST', undefined]] as const) {
      const response = await app.request('/' + id + suffix, method, body); expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Note not found' } });
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
    const row = await created.json() as NoteRecord;
    expect((await app.request('/' + row.id, 'PATCH', { projectId: null })).status).toBe(200);
    expect((await app.request('/' + row.id + '/archive', 'POST', { ownerId: 'injected' })).status).toBe(400);
    expect((await app.request('/' + row.id + '/archive', 'POST', [])).status).toBe(400);
    expect((await app.request('/' + row.id, 'PATCH', {})).status).toBe(400);
  });
});
it('Prisma predicates scope every read/write and validate project ownership — mocked client only', async () => {
  const note = { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), updateManyAndReturn: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) };
  const project = { findFirst: vi.fn().mockResolvedValue(null) };
  const repository = createNoteRepository({ note, project } as unknown as PrismaClient);
  await repository.list('owner', noteQueryDto.parse({ page: '2', limit: '5', tag: 'Film', withoutProject: 'true' }));
  expect(note.findMany).toHaveBeenCalledWith({ where: { ownerId: 'owner', archivedAt: null, tags: { has: 'film' }, projectId: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: 5, take: 6 });
  await repository.ownsProject('owner', 'project'); expect(project.findFirst).toHaveBeenCalledWith({ where: { id: 'project', ownerId: 'owner' }, select: { id: true } });
  await repository.update('owner', 'id', { projectId: null }); expect(note.updateManyAndReturn).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' }, data: { projectId: null } });
  const at = new Date(); await repository.setArchived('owner', 'id', at);
  expect(note.updateMany).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner', archivedAt: null }, data: { archivedAt: at } });
  expect(note.findFirst).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' } });
  note.create.mockRejectedValueOnce({ code: 'P2003' });
  await expect(repository.create('owner', { title: 'x', content: '', tags: [], projectId: 'gone' })).rejects.toMatchObject({ status: 404, message: 'Project not found' });
});
