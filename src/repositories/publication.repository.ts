import type { CreatePublication, PublicationQuery, PublicationRecord } from '../publications/dto';
export type PublicationWrite = CreatePublication;
export interface PublicationRepository {
  list(ownerId: string, query: PublicationQuery): Promise<PublicationRecord[]>;
  find(ownerId: string, id: string): Promise<PublicationRecord | null>;
  ownsProject(ownerId: string, projectId: string): Promise<boolean>;
  create(ownerId: string, data: PublicationWrite): Promise<PublicationRecord>;
  update(ownerId: string, id: string, data: Partial<PublicationWrite>): Promise<PublicationRecord | null>;
  setArchived(ownerId: string, id: string, at: Date | null): Promise<PublicationRecord | null>;
}
