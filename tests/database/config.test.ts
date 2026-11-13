import { describe, expect, it } from 'vitest';
import { validateDatabaseUrl } from '../../src/infra/database/config';

const synthetic = 'postgresql://test:not-real@ep-synthetic.neon.tech/neondb?sslmode=require';
describe('database configuration', () => {
  it('accepts a TLS Neon URL and direct migration connection', () => {
    expect(validateDatabaseUrl(synthetic)).toBe(synthetic);
    expect(validateDatabaseUrl(synthetic, true)).toBe(synthetic);
  });
  it.each([undefined, '', 'invalid', 'https://ep-synthetic.neon.tech/db',
    'postgresql://test:not-real@localhost/db?sslmode=require',
    synthetic.replace('sslmode=require', 'sslmode=disable')])('rejects missing/invalid configuration without reflecting its value', (value) => {
    expect(() => validateDatabaseUrl(value)).toThrow();
    try { validateDatabaseUrl(value); } catch (error) {
      expect(String(error)).not.toContain('not-real');
    }
  });
  it('rejects a pooled migration endpoint', () => {
    expect(() => validateDatabaseUrl(synthetic.replace('ep-synthetic.', 'ep-synthetic-pooler.'), true)).toThrow();
  });
});
