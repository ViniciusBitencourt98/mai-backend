import type { ProbePersistence } from '../repositories/technical-probe.repository';

/** Technical PoC only: no business entities or controller/database coupling. */
export class TechnicalProbeService {
  constructor(private readonly persistence: ProbePersistence) {}

  read(marker: string) {
    return this.persistence.findByMarker(marker);
  }

  insert(marker: string) {
    return this.persistence.insert(marker);
  }

  insertPair(firstMarker: string, secondMarker: string) {
    return this.persistence.transaction(async (repository) => {
      const first = await repository.insert(firstMarker);
      const second = await repository.insert(secondMarker);
      return [first, second];
    });
  }
}
