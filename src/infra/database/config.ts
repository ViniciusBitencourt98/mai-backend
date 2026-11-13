export interface DatabaseBindings {
  DATABASE_URL?: string;
}

/** Errors intentionally never include connection strings or credentials. */
export function validateDatabaseUrl(value: string | undefined, direct = false): string {
  if (!value) throw new Error(direct ? 'DIRECT_URL is required' : 'DATABASE_URL is required');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid PostgreSQL connection configuration'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password
    || url.pathname.length < 2 || url.searchParams.get('sslmode') !== 'require'
    || (direct && url.hostname.split('.')[0]?.endsWith('-pooler'))) {
    throw new Error('Use a Neon PostgreSQL URL with credentials and sslmode=require; DIRECT_URL must be unpooled');
  }
  return value;
}
