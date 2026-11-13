import { expect, it } from 'vitest';
import { authSettings } from '../../src/auth/settings';

it('defaults to host-prefixed secure HttpOnly-compatible cookies', () => {
  expect(authSettings({})).toMatchObject({ cookieName: '__Host-mai_session', secure: true, sameSite: 'lax' });
});
it('allows insecure cookies only on explicit loopback development origins', () => {
  expect(authSettings({ AUTH_ENV: 'development', AUTH_COOKIE_SECURE: 'false',
    AUTH_PUBLIC_ORIGIN: 'http://localhost:8787', CORS_ALLOWED_ORIGIN: 'http://localhost:5173' }))
    .toMatchObject({ cookieName: 'mai_session', secure: false, sameSite: 'lax' });
});
it.each([
  { AUTH_PUBLIC_ORIGIN: 'http://remote.example' },
  { AUTH_PUBLIC_ORIGIN: 'http://localhost:8787' },
  { AUTH_COOKIE_SECURE: 'false' },
  { AUTH_COOKIE_SECURE: 'false', AUTH_ENV: 'production', AUTH_PUBLIC_ORIGIN: 'http://localhost:8787' },
  { AUTH_COOKIE_SECURE: 'false', AUTH_ENV: 'development', AUTH_PUBLIC_ORIGIN: 'http://app.example' },
  { AUTH_COOKIE_SECURE: 'false', AUTH_ENV: 'development', AUTH_PUBLIC_ORIGIN: 'http://localhost:8787', CORS_ALLOWED_ORIGIN: 'https://other.example' },
  { AUTH_COOKIE_SECURE: 'false', AUTH_ENV: 'development', AUTH_PUBLIC_ORIGIN: 'http://localhost:8787', AUTH_COOKIE_SAME_SITE: 'none' },
  { AUTH_COOKIE_SECURE: 'invalid' }, { AUTH_COOKIE_SAME_SITE: 'invalid' }, { AUTH_PUBLIC_ORIGIN: 'https://example.com/path' },
])('fails closed for unsafe cookie configuration', (bindings) => {
  expect(() => authSettings(bindings)).toThrow();
});
it('permits cross-site cookies only with Secure; requires explicit trusted origins', () => {
  expect(authSettings({ AUTH_COOKIE_SAME_SITE: 'none', AUTH_PUBLIC_ORIGIN: 'https://api.example' }))
    .toMatchObject({ secure: true, sameSite: 'none', trustedOrigins: ['https://api.example'] });
});
