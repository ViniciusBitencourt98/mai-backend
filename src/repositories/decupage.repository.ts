import type { SegmentRecord } from '../decupages/dto';
import type { DecupageRecord, DecupageQuery } from '../decupages/dto';
export type DecupageWrite = Pick<DecupageRecord, 'title' | 'description' | 'tags' | 'projectId'>;
export interface DecupageRepository {
  mutateSegments(ownerId: string, id: string, operation: (segments: SegmentRecord[]) => SegmentRecord[]): Promise<SegmentRecord[]>;
  listSegments(ownerId: string, id: string): Promise<SegmentRecord[] | null>;
  list(ownerId: string, query: DecupageQuery): Promise<DecupageRecord[]>;
  find(ownerId: string, id: string): Promise<DecupageRecord | null>;
  ownsProject(ownerId: string, projectId: string): Promise<boolean>;
  create(ownerId: string, data: DecupageWrite): Promise<DecupageRecord>;
  update(ownerId: string, id: string, data: Partial<DecupageWrite>): Promise<DecupageRecord | null>;
  setArchived(ownerId: string, id: string, at: Date | null): Promise<DecupageRecord | null>;
}
