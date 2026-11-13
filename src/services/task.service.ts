import { HttpError } from '../errors/http-error';
import { civilDate, localToday, subtaskResponse, type CreateTask, type PatchTask, type TaskQuery, type CreateSubtask, type PatchSubtask } from '../tasks/dto';
import type { TaskRepository, TaskWrite } from '../repositories/task.repository';
export class TaskService {
  constructor(private readonly repository: TaskRepository, private readonly now = () => new Date()) {}
  async list(ownerId: string, query: TaskQuery, timezone = 'America/Bahia') {
    const rows = await this.repository.list(ownerId, query, localToday(this.now(), timezone));
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore: rows.length > query.limit } };
  }
  async get(ownerId: string, id: string) {
    const row = await this.repository.find(ownerId, id);
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Task not found');
    return { ...row, subtasks: (await this.repository.listSubtasks(ownerId, id) ?? []).map(subtaskResponse) };
  }
  private async project(ownerId: string, id: string | null | undefined) {
    if (id && !await this.repository.ownsProject(ownerId, id)) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  }
  private dates(row: Pick<TaskWrite, 'startDate' | 'dueDate'>) {
    if (row.startDate && row.dueDate && row.dueDate < row.startDate) throw new HttpError(400, 'VALIDATION_ERROR', 'dueDate must be on or after startDate');
  }
  async create(ownerId: string, input: CreateTask) {
    await this.project(ownerId, input.projectId);
    const row: TaskWrite = { ...input, startDate: civilDate(input.startDate), dueDate: civilDate(input.dueDate),
      completedAt: input.status === 'COMPLETED' ? this.now() : null, archivedAt: null };
    this.dates(row); return this.repository.create(ownerId, row);
  }
  async update(ownerId: string, id: string, input: PatchTask) {
    // Authenticate ownership before examining a referenced project.
    await this.get(ownerId, id); await this.project(ownerId, input.projectId);
    return this.repository.mutate(ownerId, id, (current) => {
      const status = input.status ?? current.status;
      if (status !== current.status && ['COMPLETED', 'CANCELLED'].includes(current.status) && status !== 'PENDING')
        throw new HttpError(409, 'INVALID_TRANSITION', 'Reopen the task before changing its terminal status');
      const row: TaskWrite = { title: input.title ?? current.title,
        description: input.description === undefined ? current.description : input.description,
        priority: input.priority ?? current.priority, status,
        projectId: input.projectId === undefined ? current.projectId : input.projectId,
        startDate: input.startDate === undefined ? current.startDate : civilDate(input.startDate),
        dueDate: input.dueDate === undefined ? current.dueDate : civilDate(input.dueDate),
        completedAt: status === 'COMPLETED' ? current.completedAt ?? this.now() : null,
        archivedAt: current.archivedAt };
      this.dates(row); return row;
    });
  }
  complete(ownerId: string, id: string) { return this.update(ownerId, id, { status: 'COMPLETED' }); }
  reopen(ownerId: string, id: string) { return this.update(ownerId, id, { status: 'PENDING' }); }
  archive(ownerId: string, id: string) { return this.repository.mutate(ownerId, id, (row) => ({ ...row, archivedAt: row.archivedAt ?? this.now() })); }
  restore(ownerId: string, id: string) { return this.repository.mutate(ownerId, id, (row) => ({ ...row, archivedAt: null })); }
  addSubtask(ownerId: string, id: string, input: CreateSubtask) {
    return this.repository.mutateSubtasks(ownerId, id, (rows) => {
      if (rows.length >= 100) throw new HttpError(409, 'SUBTASK_LIMIT', 'Maximum 100 subtasks');
      const now = this.now();
      return [...rows, { ...input, id: crypto.randomUUID(), taskId: id, position: rows.length, createdAt: now, updatedAt: now }];
    });
  }
  updateSubtask(ownerId: string, id: string, subtaskId: string, input: PatchSubtask) {
    return this.repository.mutateSubtasks(ownerId, id, (rows) => {
      if (!rows.some((row) => row.id === subtaskId)) throw new HttpError(404, 'NOT_FOUND', 'Subtask not found');
      return rows.map((row) => row.id !== subtaskId ? row : { ...row, title: input.title ?? row.title, completed: input.completed ?? row.completed, updatedAt: this.now() });
    });
  }
  removeSubtask(ownerId: string, id: string, subtaskId: string) {
    return this.repository.mutateSubtasks(ownerId, id, (rows) => {
      if (!rows.some((row) => row.id === subtaskId)) throw new HttpError(404, 'NOT_FOUND', 'Subtask not found');
      return rows.filter((row) => row.id !== subtaskId).map((row, position) => ({ ...row, position, updatedAt: row.position === position ? row.updatedAt : this.now() }));
    });
  }
  reorderSubtasks(ownerId: string, id: string, ids: string[]) {
    return this.repository.mutateSubtasks(ownerId, id, (rows) => {
      if (ids.length !== rows.length || new Set(ids).size !== ids.length || ids.some((value) => !rows.some((row) => row.id === value)))
        throw new HttpError(400, 'VALIDATION_ERROR', 'Provide each existing subtask exactly once');
      return ids.map((value, position) => { const row = rows.find((row) => row.id === value)!;
        return { ...row, position, updatedAt: row.position === position ? row.updatedAt : this.now() }; });
    });
  }
}
export interface TaskDependencies { run<T>(operation: (service: TaskService) => Promise<T>): Promise<T>; }
