import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, vi } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import { validationContract } from './shared/validation-contract';

let worker: Unstable_DevWorker | undefined;
let configHome: string;
beforeAll(async () => {
  configHome = await mkdtemp(join(tmpdir(), 'mai-validation-'));
  vi.stubEnv('XDG_CONFIG_HOME', configHome);
  vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
  const { unstable_dev } = await import('wrangler');
  worker = await unstable_dev('tests/fixtures/validation.worker.ts', {
    config: 'wrangler.validation.jsonc',
    local: true, port: 0, inspectorPort: 0,
    persist: false, logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}, 30_000);

afterAll(async () => {
  await worker?.stop();
  vi.unstubAllEnvs();
  if (configHome) await rm(configHome, { recursive: true, force: true });
});

validationContract((path, init) => worker!.fetch(path, init));
