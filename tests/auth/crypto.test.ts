import { expect, it } from 'vitest';
import { csrfToken, digest, hashPassword, isSessionToken, newSessionToken, verifyPassword } from '../../src/auth/crypto';
import { bootstrapUserDto } from '../../src/auth/dto';
import { firstUserSql } from '../../src/auth/bootstrap';

it('hashes with random salt and verifies without retaining plaintext', async () => {
  const password = 'synthetic long test passphrase';
  const first = await hashPassword(password); const second = await hashPassword(password);
  expect(first).not.toBe(second);
  expect(first).toMatch(/^pbkdf2-sha256\$600000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  expect(first).not.toContain(password);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword('wrong', first)).toBe(false);
  expect(await verifyPassword(password, null)).toBe(false);
  expect(await verifyPassword(password, 'malformed')).toBe(false);
}, 15_000);

it('generates independent high-entropy session tokens and domain-separated CSRF tokens', () => {
  const first = newSessionToken(); const second = newSessionToken();
  expect(isSessionToken(first)).toBe(true); expect(first).not.toBe(second);
  expect(digest(first)).toMatch(/^[a-f0-9]{64}$/);
  expect(csrfToken(first)).not.toBe(digest(first));
  expect(csrfToken(first)).not.toBe(csrfToken(second));
});

it('requires a long first-user passphrase and rejects injected profile fields', () => {
  expect(bootstrapUserDto.safeParse({ email: 'user@example.invalid', name: 'User', password: 'short' }).success).toBe(false);
  expect(bootstrapUserDto.safeParse({ email: 'user@example.invalid', name: 'User', password: 'long synthetic passphrase', role: 'admin' }).success).toBe(false);
});

it('prepares single-user bootstrap transaction with a hash and escaped SQL values', async () => {
  const password = 'synthetic long test passphrase';
  const sql = await firstUserSql({ email: 'USER@example.invalid', name: "Test ' $$ user", password });
  expect(sql).not.toContain(password);
  const values = [...sql.matchAll(/decode\('([^']+)', 'base64'\)/g)].map((match) => Buffer.from(match[1]!, 'base64').toString('utf8'));
  expect(values[3]).toMatch(/^pbkdf2-sha256\$600000\$/);
  expect(sql).toContain('pg_advisory_xact_lock'); expect(sql).toContain('IF EXISTS (SELECT 1 FROM "users")');
  expect(values[2]).toBe("Test ' $$ user"); expect(values[1]).toBe("user@example.invalid");
  expect(sql).toContain('INSERT INTO "user_preferences"'); expect(sql).toContain('COMMIT;');
});
