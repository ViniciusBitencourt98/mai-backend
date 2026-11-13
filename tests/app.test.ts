import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import * as healthService from '../src/services/health.service';

const servers: Server[] = [];
async function startApp(origins = 'https://mai.example, http://localhost:5173') {
  const server = createServer(createApp(origins));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  return (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = await response.json() as { error: { code: string; message: string; details: unknown[] }; requestId: string };
  expect(body).toEqual({
    error: { code, message: expect.any(String), details: [] },
    requestId: response.headers.get('x-request-id'),
  });
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  return body;
}

describe('GET /health', () => {
  it('returns a minimal public JSON response and a server-generated request ID', async () => {
    const request = await startApp();
    const response = await request('/health', { headers: { 'X-Request-Id': 'untrusted' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.has('x-powered-by')).toBe(false);
    expect(response.headers.get('x-request-id')).not.toBe('untrusted');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('centralized errors', () => {
  it('returns JSON 404 instead of the Express HTML default', async () => {
    const request = await startApp();
    await expectError(await request('/missing'), 404, 'NOT_FOUND');
  });

  it('masks unexpected controller/service errors', async () => {
    vi.spyOn(healthService, 'getHealth').mockImplementation(() => {
      throw new Error('sensitive database/password details');
    });
    const request = await startApp();
    const response = await request('/health');
    const body = await expectError(response, 500, 'INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('sensitive');
    expect(body).not.toHaveProperty('stack');
  });

  it('returns a safe 400 for malformed JSON', async () => {
    const request = await startApp();
    await expectError(await request('/health', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"secret":',
    }), 400, 'INVALID_JSON');
  });

  it('limits JSON bodies', async () => {
    const request = await startApp();
    await expectError(await request('/health', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'a'.repeat(101 * 1024) }),
    }), 413, 'PAYLOAD_TOO_LARGE');
  });
});

describe('CORS allowlist', () => {
  it.each(['https://mai.example', 'http://localhost:5173'])(
    'allows the exact origin %s', async (origin) => {
      const request = await startApp();
      const response = await request('/health', { headers: { Origin: origin } });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('vary')).toContain('Origin');
      expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    },
  );

  it.each(['https://evil.example', 'https://mai.example.evil.example', 'null'])(
    'rejects unlisted origin %s', async (origin) => {
      const request = await startApp();
      const response = await request('/health', { headers: { Origin: origin } });
      await expectError(response, 403, 'CORS_ORIGIN_DENIED');
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
    },
  );

  it('denies browser origins by default but permits requests without Origin', async () => {
    const request = await startApp('');
    expect((await request('/health')).status).toBe(200);
    await expectError(await request('/health', {
      headers: { Origin: 'http://localhost:5173' },
    }), 403, 'CORS_ORIGIN_DENIED');
  });

  it('answers preflight for allowed origins with explicit methods and headers', async () => {
    const request = await startApp();
    const response = await request('/health', {
      method: 'OPTIONS', headers: {
        Origin: 'https://mai.example', 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(await response.text()).toBe('');
  });

  it('does not accept preflight from an unlisted origin', async () => {
    const request = await startApp();
    const response = await request('/health', {
      method: 'OPTIONS', headers: {
        Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET',
      },
    });
    await expectError(response, 403, 'CORS_ORIGIN_DENIED');
  });

  it('preserves CORS headers on application errors for allowed origins', async () => {
    const request = await startApp();
    const response = await request('/missing', { headers: { Origin: 'https://mai.example' } });
    await expectError(response, 404, 'NOT_FOUND');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mai.example');
  });

  it.each(['*', 'null', 'https://mai.example/path', 'https://mai.example/', 'ftp://mai.example'])(
    'fails closed for invalid configuration %s', (origin) => {
      expect(() => createApp(origin)).toThrow();
    },
  );
});
