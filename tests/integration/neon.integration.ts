import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';
import { requireDevelopmentDatabase } from '../../scripts/development-database.mjs';

const configured = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
if (process.env.DATABASE_URL || process.env.DIRECT_URL) requireDevelopmentDatabase(process.env);
let worker: Unstable_DevWorker | undefined;
let configHome: string;
const marker = 'integration-' + randomUUID();
async function request(action: string, suffix: string) {
  return worker!.fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ marker: marker + suffix }) });
}

describe.skipIf(!configured)('Neon development through local workerd — real PostgreSQL', () => {
  beforeAll(async () => {
    configHome = await mkdtemp(join(tmpdir(), 'mai-db-'));
    vi.stubEnv('XDG_CONFIG_HOME', configHome);
    vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
    const { unstable_dev } = await import('wrangler');
    worker = await unstable_dev('tests/fixtures/database.worker.ts', {
      config: 'wrangler.database.jsonc', local: true, port: 0, inspectorPort: 0,
      persist: false, logLevel: 'error',
      vars: { DATABASE_URL: process.env.DATABASE_URL! },
      experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
    });
  });

  afterAll(async () => {
    try {
      if (worker) expect((await request('/cleanup', '')).status).toBe(200);
    } finally {
      await worker?.stop();
      vi.unstubAllEnvs();
      if (configHome) await rm(configHome, { recursive: true, force: true });
    }
  });

  it('inserts and reads through independent request-scoped connections', async () => {
    expect((await request('/insert', '-single')).status).toBe(200);
    const response = await request('/read', '-single');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { marker: marker + '-single' } });
  });
  it('commits both inserts atomically', async () => {
    expect((await request('/transaction', '-commit')).status).toBe(200);
    for (const suffix of ['-commit-a', '-commit-b']) {
      const response = await request('/read', suffix);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ result: { marker: marker + suffix } });
    }
  });
  it('rolls back the first insert when the second violates the unique constraint', async () => {
    expect((await request('/rollback', '-rollback')).status).toBe(500);
    const response = await request('/read', '-rollback');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: null });
  });
});
