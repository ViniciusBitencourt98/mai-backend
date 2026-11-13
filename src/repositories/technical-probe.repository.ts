export interface TechnicalProbe {
  id: string;
  marker: string;
  createdAt: Date;
}

export interface TechnicalProbeRepository {
  insert(marker: string): Promise<TechnicalProbe>;
  findByMarker(marker: string): Promise<TechnicalProbe | null>;
}

export interface ProbePersistence extends TechnicalProbeRepository {
  transaction<T>(operation: (repository: TechnicalProbeRepository) => Promise<T>): Promise<T>;
}
