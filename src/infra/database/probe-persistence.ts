import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { ProbePersistence, TechnicalProbeRepository } from '../../repositories/technical-probe.repository';

function repository(client: Pick<Prisma.TransactionClient, 'technicalProbe'>): TechnicalProbeRepository {
  return {
    insert: (marker) => client.technicalProbe.create({ data: { marker } }),
    findByMarker: (marker) => client.technicalProbe.findUnique({ where: { marker } }),
  };
}

export function createProbePersistence(client: PrismaClient): ProbePersistence {
  return {
    ...repository(client),
    transaction: (operation) => client.$transaction((tx) => operation(repository(tx))),
  };
}
