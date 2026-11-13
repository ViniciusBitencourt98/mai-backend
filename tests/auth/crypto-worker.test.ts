import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';

let worker: Unstable_DevWorker | undefined;
let configHome: string;
beforeAll(async () => {
  configHome = await mkdtemp(join(tmpdir(), 'mai-auth-crypto-'));
  vi.stubEnv('XDG_CONFIG_HOME', configHome); vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
  const { unstable_dev } = await import('wrangler');
  worker = await unstable_dev('tests/fixtures/auth-crypto.worker.ts', {
    config: 'wrangler.jsonc', local: true, port: 0, inspectorPort: 0, logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}, 30_000);
afterAll(async () => {
  await worker?.stop(); vi.unstubAllEnvs();
  if (configHome) await rm(configHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
it('runs the real 600k-iteration KDF and token primitives in workerd', async () => {
  const response = await worker!.fetch();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ valid: true, invalid: false, unknown: false, csrf: true });
}, 20_000);
