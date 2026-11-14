import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from '../auth/repository.fake';
import { PublicationService } from '../../src/services/publication.service';
import type { PublicationRepository } from '../../src/repositories/publication.repository';
import { createPublicationDto, patchPublicationDto, publicationQueryDto, publicationPlatformDto, publicationFormatDto, publicationStatusDto, publicationResponse, type PublicationRecord } from '../../src/publications/dto';
import { createPublicationRepository } from '../../src/infra/database/publication-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';

function fake() {
  const records = new Map<string, PublicationRecord>();
  const projects = new Map<string, string>();
  const repository: PublicationRepository = {
    async create(ownerId, data) { const row = { ...data, id: randomUUID(), ownerId, createdAt: new Date(), updatedAt: new Date(), archivedAt: null }; records.set(row.id, row); return row; },
    async find(ownerId, id) { const row = records.get(id); return row?.ownerId === ownerId ? row : null; },
    async ownsProject(ownerId, id) { return projects.get(id) === ownerId; },
    async update(ownerId, id, data) { const row = await repository.find(ownerId, id); if (!row) return null; const next = { ...row, ...data }; records.set(id, next); return next; },
    async setArchived(ownerId, id, at) { const row = await repository.find(ownerId, id); if (!row) return null; row.archivedAt = at ? row.archivedAt ?? at : null; return { ...row }; },
    async list(ownerId, query) {
      const rows = [...records.values()].filter((p) => p.ownerId === ownerId
        && (query.includeArchived || !p.archivedAt)
        && (!query.q || p.title.toLowerCase().includes(query.q.toLowerCase()))
        && (!query.platform || p.platform === query.platform) && (!query.format || p.format === query.format)
        && (!query.status || p.status === query.status) && (!query.projectId || p.projectId === query.projectId)
        && (!query.from || (p.scheduledAt !== null && p.scheduledAt >= query.from))
        && (!query.to || (p.scheduledAt !== null && p.scheduledAt < query.to)));
      rows.sort((a, b) => {
        const left = a[query.sort], right = b[query.sort];
        if (left === null && right !== null) return 1;
        if (right === null && left !== null) return -1;
        return ((left?.getTime() ?? 0) - (right?.getTime() ?? 0)) * (query.order === 'asc' ? 1 : -1) || a.id.localeCompare(b.id);
      });
      return rows.slice((query.page - 1) * query.limit, query.page * query.limit + 1);
    },
  };
  return { repository, records, projects, service: new PublicationService(repository) };
}
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function setup() {
  const publications = fake(); const ownerId = randomUUID(); const token = newSessionToken();
  const auth = authRepositoryFake({ id: ownerId, name: 'Synthetic', email: 'test@example.invalid', passwordHash: 'unused', disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } });
  await auth.repository.issueSession({ userId: ownerId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000), now: new Date() });
  const settings = authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.example.invalid', CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const app = createApp('', { services: { auth: { settings, run: (fn) => fn(new AuthService(auth.repository)) }, publications: { run: (fn) => fn(publications.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const headers = { Cookie: settings.cookieName + '=' + token, Origin: 'https://app.example.invalid', 'X-CSRF-Token': csrfToken(token), 'Content-Type': 'application/json' };
  const request = (path = '', method = 'GET', body?: unknown, custom = headers) => fetch(`http://127.0.0.1:${address.port}/publications${path}`, { method, headers: custom, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ...publications, ownerId, headers, request };
}


const base = { title: 'Film', platform: 'INSTAGRAM', format: 'REELS' } as const;
const scheduledAt = '2026-11-14T15:30:00-03:00';
const publishedAt = '2026-11-14T19:00:00Z';

describe('publication DTOs', () => {
  it('defaults optional fields without manufacturing dates and serializes UTC', () => {
    expect(createPublicationDto.parse({ ...base, title: ' Film ' })).toEqual({
      ...base, status: 'IDEA', caption: null, notes: null, externalUrl: null, projectId: null, scheduledAt: null, publishedAt: null,
    });
    expect(createPublicationDto.parse({ ...base, scheduledAt }).scheduledAt?.toISOString()).toBe('2026-11-14T18:30:00.000Z');
    expect(patchPublicationDto.parse({ caption: null, notes: null, scheduledAt: null, publishedAt: null, externalUrl: null, projectId: null }))
      .toEqual({ caption: null, notes: null, scheduledAt: null, publishedAt: null, externalUrl: null, projectId: null });
    expect(patchPublicationDto.parse({ title: 'Other' })).toEqual({ title: 'Other' });
  });
  it.each([
    {}, { ...base, title: ' ' }, { ...base, title: 'x'.repeat(201) }, { ...base, platform: 'unknown' },
    { ...base, format: 'unknown' }, { ...base, status: 'SCHEDULED' }, { ...base, platform: null },
    { ...base, ownerId: randomUUID() }, { ...base, archivedAt: null }, { ...base, projectId: 'invalid' },
    { ...base, caption: 'x'.repeat(50001) }, { ...base, notes: 'x'.repeat(50001) },
    { ...base, scheduledAt: '2026-11-14' }, { ...base, scheduledAt: '2026-02-30T12:00:00Z' },
    { ...base, scheduledAt: '2026-11-14T12:00:00' }, { ...base, scheduledAt: '2026-11-14T12:00:00.1234Z' },
    { ...base, publishedAt: '0000-01-01T00:00:00Z' }, { ...base, publishedAt: '9999-12-31T23:59:59-03:00' },
    { ...base, externalUrl: 'javascript:alert(1)' }, { ...base, externalUrl: 'file:///tmp/x' },
    { ...base, externalUrl: 'https://' }, { ...base, externalUrl: 'https://example.invalid/' + 'x'.repeat(2000) },
  ])('rejects invalid creation %#', (input) => { expect(createPublicationDto.safeParse(input).success).toBe(false); });
  it.each([{}, { ownerId: randomUUID() }, { title: null }, { platform: 'instagram' }, { format: 'Video' }, { status: 'approved' }, { publishedAt: 'bad' }])('rejects invalid patch %#', (input) => {
    expect(patchPublicationDto.safeParse(input).success).toBe(false);
  });
  it.each([
    { limit: '101' }, { page: '0' }, { page: '1000001' }, { page: '1.1' }, { limit: '1e2' }, { q: ['a', 'b'] },
    { q: 'x'.repeat(201) }, { includeArchived: 'yes' }, { platform: 'other' }, { format: 'bad' },
    { status: ['READY', 'IDEA'] }, { sort: 'title' }, { order: 'bad' }, { unknown: 'value' },
    { from: publishedAt, to: publishedAt }, { from: publishedAt, to: scheduledAt }, { from: '2026-11-14' },
  ])('rejects query %#', (input) => { expect(publicationQueryDto.safeParse(input).success).toBe(false); });
  it.each(['http://example.invalid/path', 'https://example.invalid/video?id=1'])('accepts HTTP(S) link %s', (externalUrl) => {
    expect(createPublicationDto.parse({ ...base, externalUrl }).externalUrl).toBe(externalUrl);
  });
});

describe('publication service with isolated persistence', () => {
  it('creates independently, links own project, edits and detaches without losing content', async () => {
    const app = fake(); const projectId = randomUUID(); app.projects.set(projectId, 'owner');
    const row = await app.service.create('owner', createPublicationDto.parse(base));
    expect(row).toMatchObject({ projectId: null, status: 'IDEA', scheduledAt: null });
    const updated = await app.service.update('owner', row.id, patchPublicationDto.parse({ caption: 'Caption', notes: 'Notes', projectId,
      platform: 'YOUTUBE', format: 'LONG_VIDEO', scheduledAt, externalUrl: 'https://example.invalid/video' }));
    expect(updated).toMatchObject({ caption: 'Caption', notes: 'Notes', projectId, platform: 'YOUTUBE', format: 'LONG_VIDEO' });
    const detached = await app.service.update('owner', row.id, { projectId: null });
    expect(detached).toMatchObject({ projectId: null, caption: 'Caption', notes: 'Notes', externalUrl: 'https://example.invalid/video' });
    expect((await app.service.create('owner', createPublicationDto.parse({ ...base, projectId }))).projectId).toBe(projectId);
    const cleared = await app.service.update('owner', row.id, { caption: null, notes: null, externalUrl: null, scheduledAt: null });
    expect(cleared).toMatchObject({ caption: null, notes: null, externalUrl: null, scheduledAt: null });
  });
  it.each(publicationPlatformDto.options)('creates platform %s', async (platform) => {
    expect((await fake().service.create('owner', createPublicationDto.parse({ ...base, platform }))).platform).toBe(platform);
  });
  it.each(publicationFormatDto.options)('creates format %s independently of platform', async (format) => {
    expect((await fake().service.create('owner', createPublicationDto.parse({ ...base, format }))).format).toBe(format);
  });
  it('changes every manual status without synthesizing/resetting publishedAt; only explicit dates modify it', async () => {
    const app = fake(); const row = await app.service.create('owner', createPublicationDto.parse(base));
    for (const status of publicationStatusDto.options) {
      expect(await app.service.update('owner', row.id, { status })).toMatchObject({ status, publishedAt: null });
    }
    await app.service.update('owner', row.id, patchPublicationDto.parse({ status: 'PUBLISHED', publishedAt }));
    for (const patch of [{ title: 'Edited' }, { status: 'PUBLISHED' }, { status: 'CANCELLED' }, { status: 'IDEA' }, { scheduledAt: null }] as const) {
      expect((await app.service.update('owner', row.id, patch)).publishedAt?.toISOString()).toBe('2026-11-14T19:00:00.000Z');
    }
    await app.service.archive('owner', row.id); await app.service.restore('owner', row.id);
    expect((await app.service.get('owner', row.id)).publishedAt?.toISOString()).toBe('2026-11-14T19:00:00.000Z');
    expect((await app.service.update('owner', row.id, { publishedAt: null })).publishedAt).toBeNull();
    const historical = await app.service.create('owner', createPublicationDto.parse({ ...base, status: 'PUBLISHED', publishedAt }));
    expect(publicationResponse(historical)).toMatchObject({ status: 'PUBLISHED', publishedAt: '2026-11-14T19:00:00.000Z' });
  });
  it('rejects missing/foreign project on create and patch without modifying record', async () => {
    const app = fake(); const foreign = randomUUID(); app.projects.set(foreign, 'other');
    const row = await app.service.create('owner', createPublicationDto.parse(base));
    for (const projectId of [foreign, randomUUID()]) {
      await expect(app.service.create('owner', createPublicationDto.parse({ ...base, projectId }))).rejects.toMatchObject({ status: 404, message: 'Project not found' });
      await expect(app.service.update('owner', row.id, { projectId, title: 'Attack' })).rejects.toMatchObject({ status: 404, message: 'Project not found' });
    }
    expect(app.records.size).toBe(1); expect(app.records.get(row.id)).toMatchObject({ title: 'Film', projectId: null });
  });
  it('archives/restores idempotently preserving status and dates; archive is independent of cancellation', async () => {
    const app = fake(); const row = await app.service.create('owner', createPublicationDto.parse({ ...base, status: 'CANCELLED', scheduledAt }));
    const archived = await app.service.archive('owner', row.id);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect((await app.service.archive('owner', row.id)).archivedAt).toEqual(archived.archivedAt);
    expect((await app.service.list('owner', publicationQueryDto.parse({}))).items).toEqual([]);
    expect((await app.service.list('owner', publicationQueryDto.parse({ includeArchived: 'true' }))).items).toHaveLength(1);
    expect((await app.service.get('owner', row.id)).archivedAt).not.toBeNull();
    expect(await app.service.restore('owner', row.id)).toMatchObject({ archivedAt: null, status: 'CANCELLED', scheduledAt: new Date(scheduledAt) });
    expect((await app.service.restore('owner', row.id)).archivedAt).toBeNull();
  });
  it('combines filters, uses half-open planned dates, and paginates with null dates last', async () => {
    const app = fake(); const projectId = randomUUID(); app.projects.set(projectId, 'owner');
    const row = await app.service.create('owner', createPublicationDto.parse({ ...base, title: 'Film teaser', projectId, status: 'READY', scheduledAt }));
    const atEnd = await app.service.create('owner', createPublicationDto.parse({ ...base, scheduledAt: publishedAt }));
    const undated = await app.service.create('owner', createPublicationDto.parse(base));
    await app.service.create('other', createPublicationDto.parse({ ...base, scheduledAt }));
    const filtered = await app.service.list('owner', publicationQueryDto.parse({ q: ' TEASER ', platform: 'INSTAGRAM', format: 'REELS', status: 'READY', projectId, from: scheduledAt, to: publishedAt }));
    expect(filtered.items.map((p) => p.id)).toEqual([row.id]);
    expect((await app.service.list('owner', publicationQueryDto.parse({ from: publishedAt }))).items.map((p) => p.id)).toEqual([atEnd.id]);
    expect((await app.service.list('owner', publicationQueryDto.parse({ to: publishedAt }))).items.map((p) => p.id)).toEqual([row.id]);
    for (const query of [{ platform: 'FACEBOOK' }, { format: 'TEXT' }, { status: 'PUBLISHED' }, { projectId: randomUUID() }]) {
      expect((await app.service.list('owner', publicationQueryDto.parse(query))).items).toEqual([]);
    }
    const page = await app.service.list('owner', publicationQueryDto.parse({ limit: '1' }));
    expect(page.items.map((p) => p.id)).toEqual([row.id]); expect(page.page).toEqual({ number: 1, limit: 1, hasMore: true });
    expect((await app.service.list('owner', publicationQueryDto.parse({ limit: '1', page: '3' }))).items.map((p) => p.id)).toEqual([undated.id]);
    const descending = await app.service.list('owner', publicationQueryDto.parse({ order: 'desc' }));
    expect(descending.items.map((p) => p.id)).toEqual([atEnd.id, row.id, undated.id]);
    app.records.get(row.id)!.updatedAt = new Date('2027-01-01T00:00:00Z');
    expect((await app.service.list('owner', publicationQueryDto.parse({ sort: 'updatedAt', order: 'desc' }))).items[0]?.id).toBe(row.id);
    expect((await app.service.list('owner', publicationQueryDto.parse({ page: '100' }))).items).toEqual([]);
  });
  it('returns not found if an update loses its target between read and write', async () => {
    const app = fake(); const row = await app.service.create('owner', createPublicationDto.parse(base));
    vi.spyOn(app.repository, 'update').mockResolvedValue(null);
    await expect(app.service.update('owner', row.id, { title: 'Changed' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('publications HTTP — isolated repository, not Neon', () => {
  it('serves all six endpoints, normalizes dates, and exposes no automatic publishing action', async () => {
    const app = await setup();
    const created = await app.request('', 'POST', { ...base, scheduledAt }); expect(created.status).toBe(201);
    const row = await created.json() as { id: string };
    expect(created.headers.get('location')).toBe('/publications/' + row.id);
    expect(created.headers.get('cache-control')).toBe('no-store');
    expect(await (await app.request('/' + row.id)).json()).toMatchObject({ ownerId: app.ownerId, scheduledAt: '2026-11-14T18:30:00.000Z', publishedAt: null });
    const patched = await app.request('/' + row.id, 'PATCH', { status: 'PUBLISHED', publishedAt });
    expect(patched.status).toBe(200); expect(await patched.json()).toMatchObject({ status: 'PUBLISHED', publishedAt: '2026-11-14T19:00:00.000Z' });
    expect((await app.request('/' + row.id + '/archive', 'POST')).status).toBe(200);
    expect(await (await app.request()).json()).toMatchObject({ items: [] });
    expect(await (await app.request('?includeArchived=true&platform=INSTAGRAM&format=REELS&status=PUBLISHED')).json()).toMatchObject({ items: [{ id: row.id }], page: { hasMore: false } });
    expect((await app.request('/' + row.id + '/restore', 'POST', {})).status).toBe(200);
    const cors = await app.request('', 'OPTIONS', undefined, { ...app.headers, 'Access-Control-Request-Method': 'PATCH' } as typeof app.headers);
    expect(cors.headers.get('access-control-allow-credentials')).toBe('true');
    expect(cors.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect((await app.request('/' + row.id, 'DELETE')).status).toBe(404);
  });
  it('requires authentication and prevents cross-owner access on every endpoint', async () => {
    const app = await setup(); const foreign = await app.service.create('other', createPublicationDto.parse(base));
    const endpoints = [['', 'GET'], ['', 'POST'], ['/' + foreign.id, 'GET'], ['/' + foreign.id, 'PATCH'], ['/' + foreign.id + '/archive', 'POST'], ['/' + foreign.id + '/restore', 'POST']];
    for (const [path, method] of endpoints) expect((await app.request(path, method, undefined, {} as typeof app.headers)).status).toBe(401);
    for (const id of [foreign.id, randomUUID()]) for (const [suffix, method, body] of [['', 'GET', undefined], ['', 'PATCH', { title: 'Attack' }], ['/archive', 'POST', undefined], ['/restore', 'POST', {}]] as const) {
      const response = await app.request('/' + id + suffix, method, body); expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Publication not found' } });
    }
    expect(await (await app.request()).json()).toMatchObject({ items: [] });
    expect(app.records.get(foreign.id)).toMatchObject({ title: 'Film', archivedAt: null });
  });
  it('rejects missing/invalid CSRF and Origin on all mutations without writing', async () => {
    const app = await setup(); const row = await app.service.create(app.ownerId, createPublicationDto.parse(base));
    for (const [path, method, body] of [['', 'POST', base], ['/' + row.id, 'PATCH', { title: 'Attack' }], ['/' + row.id + '/archive', 'POST', {}], ['/' + row.id + '/restore', 'POST', {}]] as const) {
      for (const headers of [{ ...app.headers, Origin: '' }, { ...app.headers, Origin: 'https://evil.invalid' }, { ...app.headers, 'X-CSRF-Token': '' }, { ...app.headers, 'X-CSRF-Token': 'bad' }]) {
        expect((await app.request(path, method, body, headers)).status).toBe(403);
      }
    }
    expect(app.records.size).toBe(1); expect(app.records.get(row.id)).toMatchObject({ title: 'Film', archivedAt: null });
  });
  it('rejects invalid input/media/query and protects project links and owner metadata', async () => {
    const app = await setup(); const foreign = randomUUID(); app.projects.set(foreign, 'other');
    expect((await app.request('', 'POST', { ...base, ownerId: app.ownerId })).status).toBe(400);
    expect((await app.request('', 'POST', { ...base, projectId: foreign })).status).toBe(404);
    expect((await app.request('', 'POST', base, { ...app.headers, 'Content-Type': 'text/plain' })).status).toBe(415);
    for (const query of ['?limit=101', '?status=READY&status=IDEA', '?q=a&q=b', '?includeArchived=true&includeArchived=false', '?unknown=x', '?from=bad']) {
      expect((await app.request(query)).status).toBe(400);
    }
    expect((await app.request('/invalid')).status).toBe(400);
    const projectId = randomUUID(); app.projects.set(projectId, app.ownerId);
    const created = await app.request('', 'POST', { ...base, projectId }); expect(created.status).toBe(201);
    const row = await created.json() as { id: string };
    expect((await app.request('/' + row.id, 'PATCH', { projectId: foreign })).status).toBe(404);
    expect((await app.request('/' + row.id, 'PATCH', { projectId: null })).status).toBe(200);
    for (const body of [{}, { ownerId: randomUUID() }, { updatedAt: scheduledAt }, { status: 'SCHEDULED' }, { externalUrl: 'javascript:alert(1)' }]) {
      expect((await app.request('/' + row.id, 'PATCH', body)).status).toBe(400);
    }
    expect((await app.request('/' + row.id + '/archive', 'POST', { title: 'Attack' })).status).toBe(400);
    expect((await app.request('/' + row.id + '/restore', 'POST', [])).status).toBe(400);
    expect((await app.request('', 'POST', { ...base, caption: 'x'.repeat(103000) })).status).toBe(413);
  });
});

it('Prisma scopes all operations, combines real query predicates and leaves absent publishedAt untouched — mocked client', async () => {
  const publication = { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), updateManyAndReturn: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) };
  const project = { findFirst: vi.fn().mockResolvedValue(null) };
  const repository = createPublicationRepository({ publication, project } as unknown as PrismaClient);
  await repository.list('owner', publicationQueryDto.parse({ q: '100%_film', platform: 'YOUTUBE', format: 'LONG_VIDEO', status: 'READY', projectId: '00000000-0000-4000-8000-000000000001', from: scheduledAt, to: publishedAt, page: '2', limit: '5', order: 'desc' }));
  expect(publication.findMany).toHaveBeenLastCalledWith({ where: { ownerId: 'owner', archivedAt: null, title: { contains: '100\\%\\_film', mode: 'insensitive' }, platform: 'YOUTUBE', format: 'LONG_VIDEO', status: 'READY', projectId: '00000000-0000-4000-8000-000000000001', scheduledAt: { gte: new Date(scheduledAt), lt: new Date(publishedAt) } }, orderBy: [{ scheduledAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }], skip: 5, take: 6 });
  await repository.list('owner', publicationQueryDto.parse({ includeArchived: 'true', sort: 'updatedAt', order: 'desc' }));
  expect(publication.findMany).toHaveBeenLastCalledWith({ where: { ownerId: 'owner' }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: 0, take: 21 });
  await repository.find('owner', 'id'); expect(publication.findFirst).toHaveBeenLastCalledWith({ where: { id: 'id', ownerId: 'owner' } });
  await repository.ownsProject('owner', 'project'); expect(project.findFirst).toHaveBeenCalledWith({ where: { id: 'project', ownerId: 'owner' }, select: { id: true } });
  const input = createPublicationDto.parse(base); await repository.create('owner', input);
  expect(publication.create).toHaveBeenCalledWith({ data: { ...input, ownerId: 'owner' } });
  await repository.update('owner', 'id', { status: 'PUBLISHED' });
  expect(publication.updateManyAndReturn).toHaveBeenCalledWith({ where: { id: 'id', ownerId: 'owner' }, data: { status: 'PUBLISHED' } });
  const at = new Date(); await repository.setArchived('owner', 'id', at);
  expect(publication.updateMany).toHaveBeenLastCalledWith({ where: { id: 'id', ownerId: 'owner', archivedAt: null }, data: { archivedAt: at } });
  await repository.setArchived('owner', 'id', null);
  expect(publication.updateMany).toHaveBeenLastCalledWith({ where: { id: 'id', ownerId: 'owner', archivedAt: { not: null } }, data: { archivedAt: null } });
  publication.create.mockRejectedValueOnce({ code: 'P2003' });
  await expect(repository.create('owner', input)).rejects.toMatchObject({ status: 404, message: 'Project not found' });
  publication.updateManyAndReturn.mockRejectedValueOnce({ code: 'P2003' });
  await expect(repository.update('owner', 'id', { projectId: 'gone' })).rejects.toMatchObject({ status: 404, message: 'Project not found' });
  const failure = new Error('Database unavailable'); publication.create.mockRejectedValueOnce(failure);
  await expect(repository.create('owner', input)).rejects.toBe(failure);
});
