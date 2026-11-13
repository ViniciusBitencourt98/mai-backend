import { describe, expect, it } from 'vitest';
import { TechnicalProbeService } from '../../src/services/technical-probe.service';
import type { ProbePersistence, TechnicalProbe, TechnicalProbeRepository } from '../../src/repositories/technical-probe.repository';

function memoryPersistence(): ProbePersistence {
  let rows: TechnicalProbe[] = [];
  const insert = async (marker: string) => {
    if (rows.some((row) => row.marker === marker)) throw new Error('duplicate marker');
    const row = { id: crypto.randomUUID(), marker, createdAt: new Date() };
    rows.push(row);
    return row;
  };
  const findByMarker = async (marker: string) => rows.find((row) => row.marker === marker) ?? null;
  const repository: TechnicalProbeRepository = { insert, findByMarker };
  return {
    ...repository,
    async transaction(operation) {
      const before = [...rows];
      try { return await operation(repository); } catch (error) { rows = before; throw error; }
    },
  };
}

describe('technical persistence service — isolated tests, not PostgreSQL validation', () => {
  it('inserts and reads through the injected repository', async () => {
    const service = new TechnicalProbeService(memoryPersistence());
    expect(await service.read('missing')).toBeNull();
    const created = await service.insert('one');
    expect(await service.read('one')).toEqual(created);
  });
  it('writes both records through the transaction boundary', async () => {
    const service = new TechnicalProbeService(memoryPersistence());
    const rows = await service.insertPair('one', 'two');
    expect(rows.map((row) => row.marker)).toEqual(['one', 'two']);
    expect(await service.read('two')).not.toBeNull();
  });
  it('propagates transaction failure without retaining partial state in the fake', async () => {
    const service = new TechnicalProbeService(memoryPersistence());
    await expect(service.insertPair('duplicate', 'duplicate')).rejects.toThrow('duplicate');
    expect(await service.read('duplicate')).toBeNull();
  });
});
