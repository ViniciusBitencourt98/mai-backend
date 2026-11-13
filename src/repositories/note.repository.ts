import type { NoteRecord, NoteQuery } from '../notes/dto';
export type NoteWrite = Pick<NoteRecord, 'title' | 'content' | 'tags' | 'projectId'>;
export interface NoteRepository {
  list(ownerId: string, query: NoteQuery): Promise<NoteRecord[]>;
  find(ownerId: string, id: string): Promise<NoteRecord | null>;
  ownsProject(ownerId: string, projectId: string): Promise<boolean>;
  create(ownerId: string, data: NoteWrite): Promise<NoteRecord>;
  update(ownerId: string, id: string, data: Partial<NoteWrite>): Promise<NoteRecord | null>;
  setArchived(ownerId: string, id: string, at: Date | null): Promise<NoteRecord | null>;
}
