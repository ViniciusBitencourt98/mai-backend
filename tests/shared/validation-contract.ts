import { describe, expect, it } from 'vitest';

interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null; has(name: string): boolean };
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type ValidationRequest = (path: string, init?: {
  method?: string; headers?: Record<string, string>; body?: string;
}) => Promise<HttpResponse>;

export function validationContract(request: ValidationRequest) {
  const origin = 'https://mai.example';
  async function error(path: string, status: number, code: string) {
    const response = await request(path, { headers: { Origin: origin } });
    expect(response.status).toBe(status);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await response.json()).toEqual({
      error: { code, message: expect.any(String), details: [] },
      requestId: response.headers.get('x-request-id'),
    });
    return response;
  }

  describe('F0-06 Express/Workers compatibility contract', () => {
    it('serves health JSON and runs header middleware', async () => {
      const response = await request('/health');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.has('x-powered-by')).toBe(false);
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
      expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('parses a nested UTF-8 JSON body, preserves values, and returns 201', async () => {
      const body = { title: 'Produção 🎬', count: 0, enabled: false, nested: { tags: ['ação'], value: null } };
      const response = await request('/__validation/echo', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
      expect(await response.json()).toEqual({ body, requestId: response.headers.get('x-request-id') });
    });

    it.each(['/__validation/error', '/__validation/async-error'])(
      'masks synchronous and rejected asynchronous errors: %s', async (path) => {
        const response = await request(path);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] },
          requestId: response.headers.get('x-request-id'),
        });
      },
    );

    it('preserves an explicit HTTP error status', async () => {
      await error('/__validation/http-error', 422, 'VALIDATION_ERROR');
    });

    it('returns JSON 404 on a missing route', async () => {
      await error('/missing', 404, 'NOT_FOUND');
    });

    it('rejects malformed JSON without reflecting body content', async () => {
      const response = await request('/__validation/echo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private":',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: 'INVALID_JSON', message: 'Invalid JSON body', details: [] },
        requestId: response.headers.get('x-request-id'),
      });
    });

    it('enforces the 100 KiB body limit', async () => {
      const response = await request('/__validation/echo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'x'.repeat(101 * 1024) }),
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    });

    it('rejects foreign origins before reaching the error route', async () => {
      const response = await request('/__validation/error', { headers: { Origin: 'https://denied.example' } });
      expect(response.status).toBe(403);
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
      expect(await response.json()).toMatchObject({ error: { code: 'CORS_ORIGIN_DENIED' } });
    });

    it('handles allowed preflight for JSON POST with an empty 204 body', async () => {
      const response = await request('/__validation/echo', {
        method: 'OPTIONS', headers: { Origin: origin,
          'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, HEAD, POST, OPTIONS');
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
      expect(response.headers.get('vary')).toContain('Origin');
      expect(response.headers.has('access-control-allow-credentials')).toBe(false);
      expect(await response.text()).toBe('');
    });

    it('handles HEAD without a response body', async () => {
      const response = await request('/health', { method: 'HEAD' });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    });

    it('generates distinct request IDs instead of trusting the client', async () => {
      const first = await request('/health', { headers: { 'X-Request-Id': 'untrusted' } });
      const second = await request('/health');
      expect(first.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
      expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'));
    });
  });
}
