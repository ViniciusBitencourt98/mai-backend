export interface AuthBindings {
  CORS_ALLOWED_ORIGIN?: string;
  AUTH_PUBLIC_ORIGIN?: string;
  AUTH_ENV?: string;
  AUTH_COOKIE_SECURE?: string;
  AUTH_COOKIE_SAME_SITE?: string;
}
export interface AuthSettings {
  cookieName: string;
  secure: boolean;
  sameSite: 'lax' | 'none';
  trustedOrigins: readonly string[];
}
export function authSettings(bindings: AuthBindings): AuthSettings {
  const origins = [...new Set([bindings.AUTH_PUBLIC_ORIGIN ?? '', ...(bindings.CORS_ALLOWED_ORIGIN ?? '').split(',')]
    .map((origin) => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Invalid trusted auth origin');
    if (parsed.protocol !== 'https:' && !(bindings.AUTH_ENV === 'development'
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
      throw new Error('Auth origins require HTTPS outside loopback development');
    }
  }
  if (bindings.AUTH_COOKIE_SECURE && !['true', 'false'].includes(bindings.AUTH_COOKIE_SECURE)) throw new Error('Invalid cookie secure setting');
  const secure = bindings.AUTH_COOKIE_SECURE !== 'false';
  const site = bindings.AUTH_COOKIE_SAME_SITE ?? 'lax';
  if (site !== 'lax' && site !== 'none') throw new Error('Invalid cookie SameSite setting');
  if (!secure && (bindings.AUTH_ENV !== 'development' || !bindings.AUTH_PUBLIC_ORIGIN
    || origins.some((origin) => {
      const url = new URL(origin);
      return url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    }))) throw new Error('Insecure cookies are allowed only for explicit loopback development origins');
  if (site === 'none' && !secure) throw new Error('SameSite=None requires Secure');
  return { cookieName: secure ? '__Host-mai_session' : 'mai_session', secure, sameSite: site, trustedOrigins: origins };
}
