import { HttpError } from '../errors/http-error';
import type { CreateProject, PatchProject, ProjectQuery, ProjectRecord } from '../projects/dto';
import type { ProjectRepository, ProjectWrite } from '../repositories/project.repository';

const date = (value: string | null | undefined) => value ? new Date(value + 'T00:00:00.000Z') : null;
export class ProjectService {
  constructor(private readonly repository: ProjectRepository, private readonly now = () => new Date()) {}
  async list(ownerId: string, query: ProjectQuery) {
    const rows = await this.repository.list(ownerId, query);
    const hasMore = rows.length > query.limit;
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore } };
  }
  async get(ownerId: string, id: string) {
    const project = await this.repository.find(ownerId, id);
    if (!project) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
    return project;
  }
  private validateDates(project: Pick<ProjectRecord, 'startDate' | 'dueDate'>) {
    if (project.startDate && project.dueDate && project.dueDate < project.startDate)
      throw new HttpError(400, 'VALIDATION_ERROR', 'dueDate must be on or after startDate');
  }
  async create(ownerId: string, input: CreateProject) {
    const data: ProjectWrite = { name: input.name, description: input.description ?? null,
      status: input.status, color: input.color ?? null, startDate: date(input.startDate), dueDate: date(input.dueDate),
      archivedAt: input.status === 'ARCHIVED' ? this.now() : null };
    this.validateDates(data);
    return this.repository.create(ownerId, data);
  }
  async update(ownerId: string, id: string, input: PatchProject) {
    const current = await this.get(ownerId, id);
    const { startDate, dueDate } = input;
    const data: Partial<ProjectWrite> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(startDate !== undefined ? { startDate: date(startDate) } : {}),
      ...(dueDate !== undefined ? { dueDate: date(dueDate) } : {}),
    };
    // Omitted fields remain unchanged; null explicitly clears optional fields.
    if (input.status !== undefined) data.archivedAt = input.status === 'ARCHIVED' ? current.archivedAt ?? this.now() : null;
    this.validateDates({ startDate: data.startDate === undefined ? current.startDate : data.startDate,
      dueDate: data.dueDate === undefined ? current.dueDate : data.dueDate });
    const project = await this.repository.update(ownerId, id, data);
    if (!project) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
    return project;
  }
  archive(ownerId: string, id: string) { return this.update(ownerId, id, { status: 'ARCHIVED' }); }
  restore(ownerId: string, id: string) { return this.update(ownerId, id, { status: 'ACTIVE' }); }
}
export interface ProjectDependencies {
  run<T>(operation: (service: ProjectService) => Promise<T>): Promise<T>;
}
