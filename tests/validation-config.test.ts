import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the disposable validation Worker isolated and on the application compatibility settings', () => {
  const app = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const validation = JSON.parse(readFileSync('wrangler.validation.jsonc', 'utf8'));
  expect(app.main).toBe('src/index.ts');
  expect(validation.main).toBe('tests/fixtures/validation.worker.ts');
  expect(validation.compatibility_date).toBe(app.compatibility_date);
  expect(validation.compatibility_flags).toEqual(app.compatibility_flags);
  expect(validation.workers_dev).toBe(false);
  expect(validation.routes).toEqual([]);
  expect(validation.env.development.name).toMatch(/-dev$/);
  expect(validation.env.development.name).not.toBe(app.name);
  expect(validation.env.development.routes).toEqual([]);
});
