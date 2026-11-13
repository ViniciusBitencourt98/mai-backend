import type { TaskRecord, TaskQuery, SubtaskRecord } from '../tasks/dto';
export type TaskWrite = Omit<TaskRecord, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;
export interface TaskRepository {
  list(ownerId: string, query: TaskQuery, today: string): Promise<TaskRecord[]>;
  find(ownerId: string, id: string): Promise<TaskRecord | null>;
  ownsProject(ownerId: string, projectId: string): Promise<boolean>;
  create(ownerId: string, data: TaskWrite): Promise<TaskRecord>;
  mutate(ownerId: string, id: string, operation: (current: TaskRecord) => TaskWrite): Promise<TaskRecord>;
  listSubtasks(ownerId: string, id: string): Promise<SubtaskRecord[] | null>;
  mutateSubtasks(ownerId: string, id: string, operation: (rows: SubtaskRecord[]) => SubtaskRecord[]): Promise<SubtaskRecord[]>;
}
