import { expect, it } from 'vitest';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';

const direct = 'postgresql://test:not-real@ep-synthetic.neon.tech/neondb?sslmode=require';
const runtime = direct.replace('ep-synthetic.', 'ep-synthetic-pooler.');
const valid = { DATABASE_URL: runtime, DIRECT_URL: direct, MAI_DATABASE_ENV: 'development' };
it('requires an explicit development environment', () => {
  expect(() => requireDevelopmentDatabase({ ...valid, MAI_DATABASE_ENV: 'production' })).toThrow('development');
});
it('accepts corresponding pooled runtime and direct migration URLs', () => {
  expect(() => requireDevelopmentDatabase(valid)).not.toThrow();
});
it('refuses different databases or endpoints for migrations and runtime', () => {
  expect(() => requireDevelopmentDatabase({ ...valid, DIRECT_URL: direct.replace('neondb', 'other') })).toThrow();
  expect(() => requireDevelopmentDatabase({ ...valid, DIRECT_URL: direct.replace('ep-synthetic', 'ep-other') })).toThrow();
});
it('refuses pooled migration URLs and missing bindings', () => {
  expect(() => requireDevelopmentDatabase({ ...valid, DIRECT_URL: runtime })).toThrow();
  expect(() => requireDevelopmentDatabase({ MAI_DATABASE_ENV: 'development' })).toThrow();
});
