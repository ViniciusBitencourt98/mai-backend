import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchPreferencesDto, preferenceDefaults, type PreferencesRecord } from '../../src/preferences/dto';
import { PreferencesService } from '../../src/services/preferences.service';
import { createPreferencesRepository } from '../../src/infra/database/preferences-persistence';
import type { PreferencesRepository } from '../../src/repositories/preferences.repository';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { createAuthRepository } from '../../src/infra/database/auth-persistence';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/services/auth.service';
import { authSettings } from '../../src/auth/settings';
import { csrfToken, digest, newSessionToken } from '../../src/auth/crypto';
import { authRepositoryFake } from '../auth/repository.fake';

function fixture() {
  const rows = new Map<string, PreferencesRecord>();
  const repository: PreferencesRepository = {
    get: vi.fn(async (id) => rows.get(id) ?? null),
    update: vi.fn(async (id, patch) => { const row = rows.get(id); if (!row) return null; const next = { ...row, ...patch }; rows.set(id, next); return { ...next }; }),
  };
  return { rows, repository, service: new PreferencesService(repository) };
}
describe('preferences input', () => {
  it.each(['America/Bahia','America/Sao_Paulo','America/New_York','UTC'])('accepts timezone %s', (timezone) => {
    expect(patchPreferencesDto.parse({ timezone })).toEqual({ timezone });
  });
  it.each(['00:00','08:00','12:59','23:59'])('accepts local clock %s', (dailyDigestTime) => {
    expect(patchPreferencesDto.parse({ dailyDigestTime })).toEqual({ dailyDigestTime });
  });
  it.each([{}, { name: '' }, { name: ' ' }, { name: 'x'.repeat(101) }, { timezone: 'invalid/zone' }, { timezone: '+03:00' },
    { timezone: null }, { name: null }, { emailEnabled: null }, { dailyDigestEnabled: null }, { dailyDigestTime: null },
    { emailEnabled: 'true' }, { dailyDigestEnabled: 1 }, { dailyDigestTime: '24:00' }, { dailyDigestTime: '12:60' },
    { dailyDigestTime: '8:00' }, { dailyDigestTime: '12:00:00' }, { dailyDigestTime: ' 08:00' }, { dailyDigestTime: '12:00Z' },
    { userId: randomUUID() }, { ownerId: randomUUID() }, { email: 'other@example.invalid' }, { password: 'unused' }, { disabledAt: null }, { preferences: {} },
  ])('rejects invalid/injected/null input %#', (input) => { expect(patchPreferencesDto.safeParse(input).success).toBe(false); });
  it('trims display name and does not insert defaults into partial input', () => {
    expect(patchPreferencesDto.parse({ name: ' Synthetic ' })).toEqual({ name: 'Synthetic' });
    expect(patchPreferencesDto.parse({ emailEnabled: false })).toEqual({ emailEnabled: false });
  });
});
describe('preferences service — isolated persistence', () => {
  it('reads and updates partial preferences without resetting unrelated fields or other users', async () => {
    const app = fixture(); const initial = { name: 'A', ...preferenceDefaults }; app.rows.set('A', initial); app.rows.set('B', { name: 'B', ...preferenceDefaults });
    expect(await app.service.get('A')).toEqual(initial);
    await app.service.update('A', patchPreferencesDto.parse({ timezone: 'America/New_York' }));
    await app.service.update('A', { name: 'Edited', dailyDigestTime: '23:59' });
    expect(await app.service.get('A')).toEqual({ name: 'Edited', timezone: 'America/New_York', emailEnabled: false, dailyDigestEnabled: false, dailyDigestTime: '23:59' });
    expect(await app.service.get('B')).toEqual({ name: 'B', ...preferenceDefaults });
  });
  it('enables/disables e-mail and daily digest independently and preserves schedule when disabled', async () => {
    const app = fixture(); app.rows.set('A', { name: 'A', ...preferenceDefaults });
    expect(await app.service.update('A', { emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: '09:30' })).toMatchObject({ emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: '09:30' });
    expect(await app.service.update('A', { emailEnabled: false })).toMatchObject({ emailEnabled: false, dailyDigestEnabled: true, dailyDigestTime: '09:30' });
    expect(await app.service.update('A', { dailyDigestEnabled: false })).toMatchObject({ dailyDigestEnabled: false, dailyDigestTime: '09:30' });
    expect(await app.service.update('A', { dailyDigestEnabled: true })).toMatchObject({ emailEnabled: false, dailyDigestEnabled: true, dailyDigestTime: '09:30' });
  });
  it('fails safely for unavailable accounts and propagates persistence failures', async () => {
    const app = fixture();
    await expect(app.service.get('missing')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    await expect(app.service.update('missing', { name: 'Attack' })).rejects.toMatchObject({ status: 401 });
    const failure = new Error('Database failure'); vi.mocked(app.repository.update).mockRejectedValue(failure);
    await expect(app.service.update('A', { emailEnabled: true })).rejects.toBe(failure);
  });
});
describe('Prisma repository — isolated client, not Neon', () => {
  function prisma() {
    const user = { findFirst: vi.fn().mockResolvedValue({ name: 'User', preferences: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    const userPreferences = { upsert: vi.fn().mockResolvedValue({}) };
    const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ user, userPreferences }));
    const repository = createPreferencesRepository({ user, userPreferences, $transaction: transaction } as unknown as PrismaClient);
    return { user, userPreferences, transaction, repository };
  }
  it('returns documented defaults for a missing preference row without writing on GET', async () => {
    const app = prisma(); expect(await app.repository.get('A')).toEqual({ name: 'User', ...preferenceDefaults });
    expect(app.user.findFirst).toHaveBeenCalledWith({ where: { id: 'A', disabledAt: null }, select: { name: true, preferences: { select: { timezone: true, emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: true } } } });
    expect(app.transaction).not.toHaveBeenCalled(); expect(app.userPreferences.upsert).not.toHaveBeenCalled();
    app.user.findFirst.mockResolvedValue(null); expect(await app.repository.get('A')).toBeNull();
  });
  it('locks/rechecks the session user before upsert and updates only supplied fields', async () => {
    const app = prisma();
    app.user.findFirst.mockResolvedValue({ name: 'Changed', preferences: { timezone: 'UTC', emailEnabled: false, dailyDigestEnabled: true, dailyDigestTime: '09:00' } });
    expect(await app.repository.update('A', { name: 'Changed', timezone: 'UTC', emailEnabled: false })).toMatchObject({ name: 'Changed', timezone: 'UTC', dailyDigestEnabled: true });
    expect(app.transaction).toHaveBeenCalledTimes(1);
    expect(app.user.updateMany).toHaveBeenCalledWith({ where: { id: 'A', disabledAt: null }, data: { updatedAt: expect.any(Date), name: 'Changed' } });
    expect(app.userPreferences.upsert).toHaveBeenCalledWith({ where: { userId: 'A' }, create: { userId: 'A', timezone: 'UTC', emailEnabled: false }, update: { timezone: 'UTC', emailEnabled: false } });
    expect(app.user.updateMany.mock.invocationCallOrder[0]).toBeLessThan(app.userPreferences.upsert.mock.invocationCallOrder[0]!);
    await app.repository.update('A', { dailyDigestEnabled: false, dailyDigestTime: '00:00' });
    expect(app.userPreferences.upsert).toHaveBeenLastCalledWith({ where: { userId: 'A' }, create: { userId: 'A', dailyDigestEnabled: false, dailyDigestTime: '00:00' }, update: { dailyDigestEnabled: false, dailyDigestTime: '00:00' } });
    expect(app.user.updateMany).toHaveBeenLastCalledWith({ where: { id: 'A', disabledAt: null }, data: { updatedAt: expect.any(Date) } });
  });
  it('never writes preferences if the account was deleted or disabled after authentication', async () => {
    const app = prisma(); app.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await app.repository.update('A', { emailEnabled: true })).toBeNull(); expect(app.userPreferences.upsert).not.toHaveBeenCalled();
  });
  it('awaits and propagates upsert failure inside the transaction; real rollback remains pending', async () => {
    const app = prisma(); const failure = new Error('Constraint failure'); app.userPreferences.upsert.mockRejectedValue(failure);
    await expect(app.repository.update('A', { name: 'Should roll back' })).rejects.toBe(failure);
    expect(app.user.findFirst).not.toHaveBeenCalled();
  });
  it('keeps the authentication projection limited to its existing preference fields', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    await createAuthRepository({ session: { findUnique } } as unknown as PrismaClient).findSession('synthetic-hash');
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ user: { select: expect.objectContaining({ preferences: { select: { timezone: true, emailEnabled: true } } }) } }) }));
  });
});
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }))); });
async function http() {
  const owner = randomUUID(), token = newSessionToken(), app = fixture(); app.rows.set(owner, { name: 'Synthetic', ...preferenceDefaults });
  const auth = authRepositoryFake({ id: owner, name: 'Synthetic', email: 'test@example.invalid', passwordHash: 'unused', disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } });
  await auth.repository.issueSession({ userId: owner, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000), now: new Date() });
  const settings = authSettings({ CORS_ALLOWED_ORIGIN: 'https://app.example.invalid' });
  const service = new AuthService(auth.repository);
  const server = createServer(createApp('', { services: { auth: { settings, run: (fn) => fn(service) }, preferences: { run: (fn) => fn(app.service) }, withTechnicalProbes: async () => { throw new Error('Unused'); } } })); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { Cookie: settings.cookieName + '=' + token, Origin: 'https://app.example.invalid', 'X-CSRF-Token': csrfToken(token), 'Content-Type': 'application/json' };
  const request = (method = 'GET', body?: unknown, custom = headers, suffix = '') => fetch(base + '/me/preferences' + suffix, { method, headers: custom, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { ...app, owner, auth, base, headers, request };
}
describe('preferences HTTP — authenticated isolated repositories', () => {
  it('reads and patches all supported fields, returns only the preference/profile projection', async () => {
    const app = await http();
    const response = await app.request(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ name: 'Synthetic', ...preferenceDefaults });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    const patch = await app.request('PATCH', { name: ' Edited ', timezone: 'America/New_York', emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: '23:59' });
    expect(patch.status).toBe(200); expect(await patch.json()).toEqual({ name: 'Edited', timezone: 'America/New_York', emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: '23:59' });
    expect(await (await app.request('PATCH', { emailEnabled: false })).json()).toMatchObject({ emailEnabled: false, dailyDigestEnabled: true, dailyDigestTime: '23:59' });
    const preflight = await app.request('OPTIONS', undefined, { ...app.headers, 'Access-Control-Request-Method': 'PATCH' } as typeof app.headers);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, HEAD, PATCH, OPTIONS'); expect(preflight.headers.get('access-control-allow-headers')).toContain('X-CSRF-Token');
  });
  it('requires authentication and trusted Origin/CSRF before mutation', async () => {
    const app = await http();
    for (const method of ['GET','PATCH']) expect((await app.request(method, undefined, {} as typeof app.headers)).status).toBe(401);
    for (const change of [{ Origin: '' }, { Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }]) expect((await app.request('PATCH', { emailEnabled: true }, { ...app.headers, ...change })).status).toBe(403);
    expect(app.rows.get(app.owner)).toEqual({ name: 'Synthetic', ...preferenceDefaults });
  });
  it('rejects owner injection, auth fields, invalid/null bodies, extra queries and incorrect media', async () => {
    const app = await http(); const other = randomUUID(); app.rows.set(other, { name: 'Other', ...preferenceDefaults });
    for (const body of [{ userId: other, emailEnabled: true }, { ownerId: other }, { password: 'x' }, { email: 'x@example.invalid' }, { dailyDigestEnabled: null }, {}, []]) expect((await app.request('PATCH', body)).status).toBe(400);
    for (const suffix of ['?userId=' + other, '?timezone=UTC', '?x=1&x=2']) expect((await app.request('GET', undefined, app.headers, suffix)).status).toBe(400);
    expect((await app.request('PATCH', { name: 'Other' }, { ...app.headers, 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await app.request('PATCH', { name: 'x'.repeat(103000) })).status).toBe(413);
    expect(app.rows.get(other)).toEqual({ name: 'Other', ...preferenceDefaults });
  });
  it('keeps /auth/me shape unchanged and sees new name/timezone on a subsequent request without re-login', async () => {
    const app = await http();
    const originalUpdate = vi.mocked(app.repository.update).getMockImplementation()!;
    vi.spyOn(app.repository, 'update').mockImplementation(async (id, input) => {
      const value = await originalUpdate(id, input);
      if (value) { app.auth.account.name = value.name; app.auth.account.preferences = { timezone: value.timezone, emailEnabled: value.emailEnabled }; }
      return value;
    });
    expect((await app.request('PATCH', { name: 'Edited', timezone: 'Asia/Tokyo', emailEnabled: true, dailyDigestEnabled: true })).status).toBe(200);
    const me = await fetch(app.base + '/auth/me', { headers: app.headers }); expect(me.status).toBe(200);
    const data = await me.json() as { user: { name: string; preferences: unknown } };
    expect(data.user.name).toBe('Edited'); expect(data.user.preferences).toEqual({ timezone: 'Asia/Tokyo', emailEnabled: true });
  });
  it('rejects revoked sessions and disabled accounts', async () => {
    const app = await http(); app.auth.account.disabledAt = new Date(); expect((await app.request()).status).toBe(401);
    app.auth.account.disabledAt = null; for (const session of app.auth.sessions.values()) session.revokedAt = new Date();
    expect((await app.request('PATCH', { name: 'Attack' })).status).toBe(401);
  });
});
