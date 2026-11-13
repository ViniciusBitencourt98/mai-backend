import { env } from 'cloudflare:workers';
import { createApplicationServices } from '../../src/services/container';
import { createDatabaseClient } from '../../src/infra/database/client';

// Local-only harness. Never import from the application entrypoint or deploy.
export default {
  async fetch(request: Request) {
    const input: unknown = await request.json();
    if (typeof input !== 'object' || input === null || !('marker' in input)
      || typeof input.marker !== 'string' || !/^integration-[a-f0-9-]{36}/.test(input.marker)) {
      return Response.json({ error: 'Invalid synthetic test marker' }, { status: 400 });
    }
    const marker = input.marker;
    const action = new URL(request.url).pathname;
    try {
      if (action === '/cleanup') {
        const client = createDatabaseClient(env.DATABASE_URL);
        try { await client.technicalProbe.deleteMany({ where: { marker: { startsWith: marker } } }); }
        finally { await client.$disconnect(); }
        return Response.json({ cleaned: true });
      }
      const result = await createApplicationServices(env).withTechnicalProbes<unknown>((service) => {
        if (action === '/read') return service.read(marker);
        if (action === '/insert') return service.insert(marker);
        if (action === '/transaction') return service.insertPair(marker + '-a', marker + '-b');
        if (action === '/rollback') return service.insertPair(marker, marker);
        throw new Error('Unsupported harness operation');
      });
      return Response.json({ result });
    } catch {
      // Do not reflect database errors/connection strings, even in the test harness.
      return Response.json({ error: 'Database operation failed' }, { status: 500 });
    }
  },
};
