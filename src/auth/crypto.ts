import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 600_000;
const dummyHash = `pbkdf2-sha256$${ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`;
const format = /^pbkdf2-sha256\$600000\$([a-f0-9]{32})\$([a-f0-9]{64})$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, ITERATIONS, 32, 'sha256', (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, 'utf8') > 1024) throw new Error('Password exceeds hashing input limit');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const match = format.exec(encoded ?? '');
  const candidate = match ?? format.exec(dummyHash)!;
  const actual = await derive(password, Buffer.from(candidate[1]!, 'hex'));
  return timingSafeEqual(actual, Buffer.from(candidate[2]!, 'hex')) && match !== null;
}

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const isSessionToken = (token: string) => /^[a-zA-Z0-9_-]{43}$/.test(token);
export const csrfToken = (sessionToken: string) => digest('mai-csrf-v1:' + sessionToken);
export function safeEqual(first: string, second: string): boolean {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}
