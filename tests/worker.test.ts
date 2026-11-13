import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Unstable_DevWorker } from 'wrangler';

let worker: Unstable_DevWorker | undefined;
let configHome: string;
beforeAll(async () => {
  configHome = await mkdtemp(join(tmpdir(), 'mai-wrangler-test-'));
  vi.stubEnv('XDG_CONFIG_HOME', configHome);
  vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
  const { unstable_dev } = await import('wrangler');
  worker = await unstable_dev('src/index.ts', {
    config: 'wrangler.jsonc', local: true, port: 0, inspectorPort: 0,
    persist: false, logLevel: 'error',
    vars: { CORS_ALLOWED_ORIGIN: 'https://mai.example' },
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}, 30_000);

afterAll(async () => {
  await worker?.stop();
  vi.unstubAllEnvs();
  if (configHome) await rm(configHome, { recursive: true, force: true });
});

describe('Express in the actual local Workers runtime', () => {
  it('serves GET /health through the native Cloudflare adapter', async () => {
    const response = await worker!.fetch('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reads the CORS binding and permits only the configured origin', async () => {
    const allowed = await worker!.fetch('/health', { headers: { Origin: 'https://mai.example' } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://mai.example');
    const denied = await worker!.fetch('/health', { headers: { Origin: 'https://evil.example' } });
    expect(denied.status).toBe(403);
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('returns standardized errors through the Worker', async () => {
    const response = await worker!.fetch('/missing');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found', details: [] },
      requestId: response.headers.get('x-request-id'),
    });
  });
});
