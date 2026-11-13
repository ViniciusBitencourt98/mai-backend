import { createServer, type Server } from 'node:http';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Router } from 'express';
import { createApp } from '../../src/app';
import { hashPassword, digest } from '../../src/auth/crypto';
import { authSettings, type AuthSettings } from '../../src/auth/settings';
import { AuthService } from '../../src/services/auth.service';
import { authRepositoryFake } from './repository.fake';
import type { AccountRecord } from '../../src/repositories/auth.repository';
import { requireAuthentication } from '../../src/middlewares/authentication';
import { requireOwnership } from '../../src/middlewares/ownership';
import type { AuthDependencies } from '../../src/auth/dependencies';

const password = 'synthetic test passphrase only';
const email = 'user@example.invalid';
const origin = 'https://mai.example';
const settings = authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.mai.example', CORS_ALLOWED_ORIGIN: origin });
let passwordHash: string;
const servers: Server[] = [];
beforeAll(async () => { passwordHash = await hashPassword(password); });
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
async function setup(config: AuthSettings = settings) {
  const account: AccountRecord = { id: '00000000-0000-4000-8000-000000000001', email, name: 'Synthetic user',
    passwordHash, disabledAt: null, preferences: { timezone: 'America/Bahia', emailEnabled: false } };
  const fake = authRepositoryFake(account);
  let now = new Date();
  const service = new AuthService(fake.repository, () => now);
  const auth: AuthDependencies = { settings: config, run: (operation) => operation(service) };
  const owned = Router();
  owned.get('/owned/:owner', requireAuthentication(auth), requireOwnership(async (req) => String(req.params.owner)), (_req, res) => res.json({ allowed: true }));
  const app = createApp(origin, { services: { auth, withTechnicalProbes: async () => { throw new Error('Unused'); } }, additionalRoutes: owned });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const request = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${path}`, init);
  const login = (body: unknown = { email, password }, extra: Record<string, string> = {}) => request('/auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
  });
  return { ...fake, request, login, service, advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); } };
}
function cookie(response: Response) {
  const value = response.headers.get('set-cookie');
  expect(value).toBeTruthy();
  return value!.split(';')[0]!;
}
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json() as { error: { code: string }; requestId: string };
  expect(body.error.code).toBe(code);
  expect(body.requestId).toBe(response.headers.get('x-request-id'));
  return body;
}

describe('authentication HTTP with test repository (not PostgreSQL)', () => {
  it('logs in, sets host-only secure cookie and returns a typed safe profile', async () => {
    const app = await setup();
    const response = await app.login({ email: '  USER@example.invalid ', password });
    expect(response.status).toBe(200);
    const header = response.headers.get('set-cookie')!;
    expect(header).toContain('__Host-mai_session=');
    expect(header).toContain('HttpOnly'); expect(header).toContain('Secure'); expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/'); expect(header).toContain('Max-Age=43200'); expect(header).not.toContain('Domain=');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json() as { user: { email: string }; csrfToken: string; expiresAt: string };
    expect(body.user.email).toBe(email); expect(body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain(passwordHash); expect(JSON.stringify(body)).not.toContain('password');
    const rawToken = cookie(response).split('=')[1]!;
    expect(app.sessions.has(rawToken)).toBe(false); expect(app.sessions.has(digest(rawToken))).toBe(true);
    const me = await app.request('/auth/me', { headers: { Cookie: cookie(response) } });
    expect(me.status).toBe(200); expect(await me.json()).toEqual(body);
  });

  it('uses identical public failure for wrong passwords and nonexistent accounts', async () => {
    const app = await setup();
    const wrong = await app.login({ email, password: 'wrong' });
    const missing = await app.login({ email: 'missing@example.invalid', password });
    const a = await error(wrong, 401, 'INVALID_CREDENTIALS');
    const b = await error(missing, 401, 'INVALID_CREDENTIALS');
    expect(a.error).toEqual(b.error); expect(wrong.headers.has('set-cookie')).toBe(false);
    expect(app.sessions.size).toBe(0);
  });

  it('denies disabled accounts and subsequently disabled sessions', async () => {
    const app = await setup();
    const login = await app.login(); const authCookie = cookie(login);
    app.account.disabledAt = new Date();
    await error(await app.login(), 401, 'INVALID_CREDENTIALS');
    await error(await app.request('/auth/me', { headers: { Cookie: authCookie } }), 401, 'UNAUTHENTICATED');
  });

  it.each([undefined, '__Host-mai_session=bad', '__Host-mai_session=' + 'x'.repeat(43),
    '__Host-mai_session=' + 'x'.repeat(43) + '; __Host-mai_session=' + 'y'.repeat(43)])(
    'denies absent, malformed, unknown or duplicate session cookies', async (value) => {
      const app = await setup();
      await error(await app.request('/auth/me', { headers: value ? { Cookie: value } : {} }), 401, 'UNAUTHENTICATED');
    },
  );

  it('denies expired sessions at the absolute 12-hour deadline', async () => {
    const app = await setup(); const response = await app.login();
    app.advance(12 * 60 * 60 * 1000);
    await error(await app.request('/auth/me', { headers: { Cookie: cookie(response) } }), 401, 'UNAUTHENTICATED');
  });

  it('revokes on logout, clears cookie and prevents token reuse', async () => {
    const app = await setup(); const response = await app.login();
    const body = await response.json() as { csrfToken: string };
    const authCookie = cookie(response);
    const logout = await app.request('/auth/logout', { method: 'POST', headers: {
      Origin: origin, Cookie: authCookie, 'X-CSRF-Token': body.csrfToken,
    } });
    expect(logout.status).toBe(204); expect(await logout.text()).toBe('');
    expect(logout.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    await error(await app.request('/auth/me', { headers: { Cookie: authCookie } }), 401, 'UNAUTHENTICATED');
    expect([...app.sessions.values()][0]!.revokedAt).not.toBeNull();
  });

  it('rotates an existing session rather than accepting a fixed token', async () => {
    const app = await setup(); const first = await app.login();
    const second = await app.login(undefined, { Cookie: cookie(first) });
    expect(cookie(second)).not.toBe(cookie(first));
    await error(await app.request('/auth/me', { headers: { Cookie: cookie(first) } }), 401, 'UNAUTHENTICATED');
  });

  it('rejects missing or invalid CSRF tokens without logging out', async () => {
    const app = await setup(); const login = await app.login();
    const authCookie = cookie(login);
    for (const headers of [{}, { 'X-CSRF-Token': 'incorrect' }]) {
      await error(await app.request('/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: authCookie, ...headers } }), 403, 'CSRF_TOKEN_INVALID');
    }
    expect((await app.request('/auth/me', { headers: { Cookie: authCookie } })).status).toBe(200);
  });

  it('requires trusted Origin even for login and logout', async () => {
    const app = await setup();
    await error(await app.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }), 403, 'CSRF_ORIGIN_DENIED');
    const response = await app.login();
    await error(await app.request('/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: cookie(response) } }), 403, 'CORS_ORIGIN_DENIED');
    expect([...app.sessions.values()][0]!.revokedAt).toBeNull();
  });

  it.each([{}, { email: 'invalid', password }, { email, password: '' }, { email, password, userId: 'injected' },
    { email, password: 'x'.repeat(257) }, { email, password: 1 }])('validates strict login DTO without reflecting input', async (input) => {
    const app = await setup(); await error(await app.login(input), 400, 'VALIDATION_ERROR');
    expect(app.findCalls).toBe(0);
  });

  it('rejects form submissions and malformed JSON', async () => {
    const app = await setup();
    await error(await app.request('/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=ignored' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
    await error(await app.request('/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{bad' }), 400, 'INVALID_JSON');
  });

  it('allows credentialed auth CORS and explicit preflight, never wildcard', async () => {
    const app = await setup(); const response = await app.request('/auth/logout', { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type,X-CSRF-Token',
    } });
    expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-headers')).toContain('X-CSRF-Token');
  });

  it('enforces account throttling equally for nonexistent accounts and recovers next window', async () => {
    const app = await setup();
    for (let i = 0; i < 5; i++) await error(await app.login({ email: 'unknown@example.invalid', password: 'bad' }), 401, 'INVALID_CREDENTIALS');
    const response = await app.login({ email: 'unknown@example.invalid', password: 'bad' });
    await error(response, 429, 'LOGIN_RATE_LIMITED'); expect(response.headers.get('retry-after')).toBe('900');
    app.advance(16 * 60 * 1000);
    await error(await app.login({ email: 'unknown@example.invalid', password: 'bad' }), 401, 'INVALID_CREDENTIALS');
  }, 15_000);

  it('enforces address throttling across different account names', async () => {
    const app = await setup();
    for (let i = 0; i < 20; i++) await app.login({ email: `missing${i}@example.invalid`, password: 'bad' });
    await error(await app.login({ email, password }), 429, 'LOGIN_RATE_LIMITED');
  }, 20_000);

  it('checks ownership after authentication and denies other users', async () => {
    const app = await setup();
    await error(await app.request('/owned/other'), 401, 'UNAUTHENTICATED');
    const login = await app.login(); const headers = { Cookie: cookie(login) };
    expect((await app.request('/owned/' + app.account.id, { headers })).status).toBe(200);
    await error(await app.request('/owned/other', { headers }), 403, 'FORBIDDEN');
  });

  it('never exposes a public registration endpoint', async () => {
    const app = await setup();
    expect((await app.request('/auth/register', { method: 'POST' })).status).toBe(404);
  });
});

it('uses an insecure cookie only for configured loopback HTTP development', async () => {
  const config = authSettings({ AUTH_ENV: 'development', AUTH_COOKIE_SECURE: 'false', AUTH_PUBLIC_ORIGIN: 'http://localhost:8787', CORS_ALLOWED_ORIGIN: 'http://localhost:5173' });
  const app = await setup(config);
  const response = await app.login({ email, password }, { Origin: 'http://localhost:5173' });
  expect(response.status).toBe(200);
  const header = response.headers.get('set-cookie')!;
  expect(header).toContain('mai_session='); expect(header).toContain('HttpOnly');
  expect(header).not.toContain('Secure'); expect(header).not.toContain('__Host-');
});
it('sets Secure and SameSite=None when cross-site deployment is explicitly configured', async () => {
  const app = await setup(authSettings({ AUTH_PUBLIC_ORIGIN: 'https://api.mai.example', CORS_ALLOWED_ORIGIN: origin, AUTH_COOKIE_SAME_SITE: 'none' }));
  const response = await app.login();
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('SameSite=None');
  expect(response.headers.get('set-cookie')).toContain('Secure');
});
