import { URL } from 'node:url';

export function requireDevelopmentDatabase(environment) {
  if (environment.MAI_DATABASE_ENV !== 'development') {
    throw new Error('Explicit MAI_DATABASE_ENV=development is required; never use a production database');
  }
  const urls = ['DATABASE_URL', 'DIRECT_URL'].map((name) => {
    let url;
    try { url = new URL(environment[name]); } catch { throw new Error(`${name} is missing or invalid`); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password
      || url.pathname.length < 2 || url.searchParams.get('sslmode') !== 'require') {
      throw new Error(`${name} must be a Neon PostgreSQL connection with sslmode=require`);
    }
    return url;
  });
  const [runtime, direct] = urls;
  if (direct.hostname.split('.')[0].endsWith('-pooler')
    || runtime.hostname.replace('-pooler.', '.') !== direct.hostname
    || runtime.pathname !== direct.pathname || runtime.username !== direct.username) {
    throw new Error('DATABASE_URL and unpooled DIRECT_URL must target the same development endpoint/database/role');
  }
}
