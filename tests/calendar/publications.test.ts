import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { authSettings } from '../../src/auth/settings';
import { newSessionToken } from '../../src/auth/crypto';
import type { AuthDependencies } from '../../src/auth/dependencies';
import type { AuthService } from '../../src/services/auth.service';
import { calendarQueryDto, type CalendarMaster } from '../../src/calendar/dto';
import { createCalendarRepository } from '../../src/infra/database/calendar-persistence';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { CalendarService } from '../../src/services/calendar.service';
import type { EventService } from '../../src/services/event.service';
import type { PublicationRecord } from '../../src/publications/dto';

const from = '2026-03-08T00:00:00.000Z';
const to = '2026-03-10T00:00:00.000Z';
const query = (types?: string) => calendarQueryDto.parse({ from, to, ...(types ? { types } : {}) });
const row = (id: string, changes: Partial<PublicationRecord> = {}): PublicationRecord => ({
  id, title: 'Planned film', ownerId: 'owner', projectId: null, platform: 'INSTAGRAM', format: 'REELS', status: 'PLANNED',
  scheduledAt: new Date('2026-03-08T13:00:00.123Z'), publishedAt: null, archivedAt: null,
  caption: 'Not needed in calendar', notes: 'Private editorial notes', externalUrl: 'https://example.invalid',
  createdAt: new Date(from), updatedAt: new Date(from), ...changes,
});
const master = (id: string): CalendarMaster => ({
  id, title: id, timezone: 'America/Bahia', date: '2026-03-08', completed: false,
  startAt: '2026-03-08T13:00:00.123Z', endAt: '2026-03-08T14:00:00.123Z', rule: null,
});
// In-memory database boundary for isolation only. The production Prisma repository
// builds the predicates/selection; this fixture is not PostgreSQL integration.
function setup(records: PublicationRecord[] = [], tasks: CalendarMaster[] = [], events: CalendarMaster[] = []) {
  type FindArgs = { where: { ownerId: string; archivedAt: null; status: { not: string }; scheduledAt: { gte: Date; lt: Date } }; take: number };
  const findMany = vi.fn(async ({ where, take }: FindArgs) => records.filter((r) => r.ownerId === where.ownerId
    && r.archivedAt === where.archivedAt && r.status !== where.status.not && r.scheduledAt !== null
    && r.scheduledAt >= where.scheduledAt.gte && r.scheduledAt < where.scheduledAt.lt)
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, take));
  const prisma = { publication: { findMany } } as unknown as PrismaClient;
  const repository = { ...createCalendarRepository(prisma), tasks: vi.fn(async () => tasks), events: vi.fn(async () => events) };
  const taskRun = vi.fn(async () => { throw new Error('No task expansion expected'); });
  const eventRun = vi.fn(async () => { throw new Error('No event expansion expected'); });
  const service = new CalendarService(repository, { run: taskRun }, { run: eventRun });
  return { repository, service, findMany, taskRun, eventRun };
}

describe('PUBLICATION calendar query compatibility', () => {
  it('preserves TASK,EVENT as the omitted-types default and never queries publications implicitly', async () => {
    expect(query().types).toEqual(['TASK', 'EVENT']);
    const app = setup([row('publication')], [master('task')], [master('event')]);
    expect((await app.service.list('owner', query(), 'UTC')).items.map((r) => r.type)).toEqual(['TASK', 'EVENT']);
    expect(app.findMany).not.toHaveBeenCalled();
  });
  it.each(['TASK', 'EVENT', 'PUBLICATION', 'TASK,EVENT', 'EVENT,TASK', 'TASK,PUBLICATION', 'PUBLICATION,TASK', 'EVENT,PUBLICATION', 'PUBLICATION,EVENT', 'TASK,EVENT,PUBLICATION', 'PUBLICATION,TASK,EVENT', 'EVENT,PUBLICATION,TASK', 'TASK,PUBLICATION,EVENT', 'PUBLICATION,EVENT,TASK', 'EVENT,TASK,PUBLICATION'])('accepts combination %s', (types) => {
    expect(query(types).types).toEqual(types.split(','));
  });
  it.each(['', 'PUBLICATION,PUBLICATION', 'TASK,EVENT,PUBLICATION,TASK', 'PUBLICATION,OTHER', 'TASK, PUBLICATION', 'publication', 'PUBLICATION,'])('rejects invalid types %j', (types) => {
    expect(calendarQueryDto.safeParse({ from, to, types }).success).toBe(false);
  });
});

describe('publication projection through real repository/service with simulated DB', () => {
  it('returns only minimal fields, stable identity, UTC instant and user timezone without duration', async () => {
    const app = setup([row('p', { projectId: 'project' })]);
    const result = await app.service.list('owner', query('PUBLICATION'), 'America/Bahia');
    expect(result).toEqual({ items: [{ type: 'PUBLICATION', id: 'p', masterId: 'p', title: 'Planned film',
      scheduledAt: '2026-03-08T13:00:00.123Z', status: 'PLANNED', platform: 'INSTAGRAM', projectId: 'project',
      timezone: 'America/Bahia', ruleId: null, version: null, occurrenceDate: null, recurring: false, modified: false,
      href: '/publications/p' }], page: { number: 1, limit: 20, hasMore: false }, timezone: 'America/Bahia' });
    expect(app.repository.tasks).not.toHaveBeenCalled(); expect(app.repository.events).not.toHaveBeenCalled();
    expect(app.taskRun).not.toHaveBeenCalled(); expect(app.eventRun).not.toHaveBeenCalled();
  });
  it('filters owner, archives, cancelled, missing dates and interval in the database; publishedAt is never a fallback', async () => {
    const app = setup([
      row('start', { scheduledAt: new Date(from) }), row('before', { scheduledAt: new Date(new Date(from).getTime() - 1) }),
      row('end', { scheduledAt: new Date(to) }), row('last', { scheduledAt: new Date(new Date(to).getTime() - 1) }),
      row('after', { scheduledAt: new Date(new Date(to).getTime() + 1) }),
      row('undated', { scheduledAt: null, publishedAt: new Date(from), status: 'PUBLISHED' }),
      row('archived', { archivedAt: new Date(from) }), row('cancelled', { status: 'CANCELLED' }),
      row('foreign', { ownerId: 'other' }),
      row('published', { status: 'PUBLISHED', publishedAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    const result = await app.service.list('owner', query('PUBLICATION'), 'UTC');
    expect(result.items.map((r) => r.id)).toEqual(['start', 'published', 'last']);
    expect(result.items[0]).toMatchObject({ scheduledAt: from, projectId: null });
    expect(app.findMany).toHaveBeenCalledWith({ where: { ownerId: 'owner', archivedAt: null, status: { not: 'CANCELLED' },
      scheduledAt: { gte: new Date(from), lt: new Date(to) } }, take: 101, orderBy: { id: 'asc' },
      select: { id: true, title: true, scheduledAt: true, status: true, platform: true, projectId: true } });
    expect((await app.service.list('other', query('PUBLICATION'), 'UTC')).items.map((r) => r.id)).toEqual(['foreign']);
  });
  it.each(['IDEA', 'PLANNED', 'IN_PRODUCTION', 'READY', 'PUBLISHED'] as const)('includes scheduled status %s without changing the source', async (status) => {
    const original = row('p', { status }); const app = setup([original]);
    expect((await app.service.list('owner', query('PUBLICATION'), 'UTC')).items[0]).toMatchObject({ status });
    expect(original.status).toBe(status); expect(original.publishedAt).toBeNull();
  });
  it('preserves absolute instants and millisecond boundaries across DST/offsets', async () => {
    const app = setup([row('same-instant', { scheduledAt: new Date('2026-03-08T03:00:00.123-04:00') }),
      row('before', { scheduledAt: new Date('2026-03-08T01:59:59.999-05:00') }),
      row('end', { scheduledAt: new Date('2026-03-08T03:00:00.124-04:00') })]);
    const q = calendarQueryDto.parse({ from: '2026-03-08T03:00:00.123-04:00', to: '2026-03-08T03:00:00.124-04:00', types: 'PUBLICATION' });
    const ny = await app.service.list('owner', q, 'America/New_York');
    const tokyo = await app.service.list('owner', q, 'Asia/Tokyo');
    expect(ny.items).toHaveLength(1); expect(tokyo.items).toHaveLength(1);
    expect(ny.items[0]).toMatchObject({ id: 'same-instant', scheduledAt: '2026-03-08T07:00:00.123Z', timezone: 'America/New_York' });
    expect(tokyo.items[0]).toMatchObject({ scheduledAt: '2026-03-08T07:00:00.123Z', timezone: 'Asia/Tokyo' });
  });
  it('sorts and paginates the combined result with deterministic type/ID ties and no duplication', async () => {
    const app = setup([row('b'), row('a')], [master('task')], [master('a')]);
    const q = query('PUBLICATION,EVENT,TASK');
    const all = await app.service.list('owner', q, 'UTC');
    expect(all.items.map((r) => r.type + ':' + r.id)).toEqual(['TASK:task', 'EVENT:a', 'PUBLICATION:a', 'PUBLICATION:b']);
    const first = await app.service.list('owner', { ...q, limit: 2 }, 'UTC');
    const second = await app.service.list('owner', { ...q, limit: 2, page: 2 }, 'UTC');
    expect(first.page.hasMore).toBe(true); expect(second.page.hasMore).toBe(false);
    expect([...first.items, ...second.items]).toEqual(all.items);
    expect(new Set(all.items.map((r) => r.type + ':' + r.id)).size).toBe(4);
    expect((await app.service.list('owner', { ...q, page: 3, limit: 2 }, 'UTC')).items).toEqual([]);
  });
  it.each(['TASK,PUBLICATION', 'EVENT,PUBLICATION', 'TASK,EVENT,PUBLICATION'])('queries only requested repositories for %s', async (types) => {
    const app = setup([row('p')], [master('t')], [master('e')]);
    const result = await app.service.list('owner', query(types), 'UTC');
    expect(result.items.map((r) => r.type).sort()).toEqual(types.split(',').sort());
    expect(app.repository.tasks).toHaveBeenCalledTimes(types.includes('TASK') ? 1 : 0);
    expect(app.repository.events).toHaveBeenCalledTimes(types.includes('EVENT') ? 1 : 0);
    expect(app.findMany).toHaveBeenCalledTimes(1);
  });
  it('accepts 100 publications and rejects 101 before pagination rather than silently truncating', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(String(i)));
    const app = setup(rows); const q = { ...query('PUBLICATION'), limit: 100 };
    expect((await app.service.list('owner', q, 'UTC')).items).toHaveLength(100);
    rows.push(row('101'));
    await expect(app.service.list('owner', { ...q, limit: 1 }, 'UTC')).rejects.toMatchObject({ status: 409, code: 'CALENDAR_LIMIT' });
  });
  it('counts publications toward the shared budget even when expanded events are cancelled', async () => {
    const app = setup([row('p')], [], Array.from({ length: 100 }, (_, i) => ({ ...master(String(i)),
      rule: { id: '00000000-0000-4000-8000-000000000001', version: 1, timezone: 'UTC', modifiedDates: [] } })));
    const occurrences = vi.fn(async () => ({ items: Array.from({ length: 100 }, () => ({ date: '2026-03-08', title: 'Cancelled',
      startAt: '2026-03-08T13:00:00Z', endAt: '2026-03-08T14:00:00Z', cancelled: true })), page: { hasMore: false } }));
    const service = new CalendarService(app.repository, { run: app.taskRun }, { run: (fn) => fn({ occurrences } as unknown as EventService) });
    expect((await service.list('owner', query('EVENT'), 'UTC')).items).toEqual([]);
    await expect(service.list('owner', query('EVENT,PUBLICATION'), 'UTC')).rejects.toMatchObject({ status: 409, code: 'CALENDAR_LIMIT' });
  });
});

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
it('HTTP requires session, rejects injected owner/query, and scopes publication responses to the authenticated user', async () => {
  const app = setup([row('own'), row('foreign', { ownerId: 'other' })]);
  let owner = 'owner';
  const settings = authSettings({ CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const auth: AuthDependencies = { settings, run: (fn) => fn({ authenticate: async () => ({ user: { id: owner, name: 'Synthetic', email: 'test@example.invalid',
    preferences: { timezone: 'America/Bahia', emailEnabled: false } }, sessionId: 'session', expiresAt: new Date('2099-01-01'), csrfToken: 'unused' }) } as unknown as AuthService) };
  const server = createServer(createApp('', { services: { auth, calendar: { run: (fn) => fn(app.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } }));
  servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}/calendar?from=${from}&to=${to}&types=PUBLICATION`;
  expect((await fetch(url)).status).toBe(401);
  const headers = { Cookie: settings.cookieName + '=' + newSessionToken(), Origin: 'https://app.example.invalid' };
  const response = await fetch(url, { headers }); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(await response.json()).toMatchObject({ items: [{ id: 'own', type: 'PUBLICATION', timezone: 'America/Bahia' }] });
  for (const suffix of ['&ownerId=other', '&types=TASK', '&types=PUBLICATION']) expect((await fetch(url + suffix, { headers })).status).toBe(400);
  owner = 'other';
  expect(await (await fetch(url, { headers })).json()).toMatchObject({ items: [{ id: 'foreign' }] });
});
