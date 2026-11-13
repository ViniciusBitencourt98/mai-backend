import type { ProjectRecord, ProjectQuery } from '../projects/dto';
export type ProjectWrite = Pick<ProjectRecord, 'name' | 'description' | 'status' | 'color' | 'startDate' | 'dueDate' | 'archivedAt'>;
export interface ProjectRepository {
  list(ownerId: string, query: ProjectQuery): Promise<ProjectRecord[]>;
  find(ownerId: string, id: string): Promise<ProjectRecord | null>;
  create(ownerId: string, data: ProjectWrite): Promise<ProjectRecord>;
  update(ownerId: string, id: string, data: Partial<ProjectWrite>): Promise<ProjectRecord | null>;
}
