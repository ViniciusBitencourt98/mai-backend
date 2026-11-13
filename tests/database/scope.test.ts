import { describe, expect, it, vi } from 'vitest';
import { createDatabaseClient } from '../../src/infra/database/client';
import { createPersistenceScope } from '../../src/infra/database/scope';
import { createApplicationServices } from '../../src/services/container';

const synthetic = 'postgresql://test:not-real@ep-synthetic-pooler.neon.tech/neondb?sslmode=require';
describe('request-scoped database dependencies — no network operations', () => {
  it('creates the service container lazily without a database binding', () => {
    expect(() => createApplicationServices({})).not.toThrow();
  });
  it('fails only when database access is requested without DATABASE_URL', async () => {
    await expect(createApplicationServices({}).withTechnicalProbes(async () => 'unused'))
      .rejects.toThrow('DATABASE_URL is required');
  });
  it('creates separate clients rather than caching Worker sockets globally', async () => {
    const first = createDatabaseClient(synthetic);
    const second = createDatabaseClient(synthetic);
    expect(first).not.toBe(second);
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });
  it.each([false, true])('disconnects when the operation fails=%s', async (fails) => {
    const client = createDatabaseClient(synthetic);
    const disconnect = vi.spyOn(client, '$disconnect');
    const factory = vi.fn(() => client);
    const scope = createPersistenceScope({ DATABASE_URL: synthetic }, factory);
    const operation = scope(async () => {
      if (fails) throw new Error('synthetic failure');
      return 'result';
    });
    if (fails) await expect(operation).rejects.toThrow('synthetic failure');
    else await expect(operation).resolves.toBe('result');
    expect(factory).toHaveBeenCalledWith(synthetic);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
