import { HttpError } from '../errors/http-error';
import type { CreatePublication, PatchPublication, PublicationQuery } from '../publications/dto';
import type { PublicationRepository, PublicationWrite } from '../repositories/publication.repository';
const missing = () => new HttpError(404, 'NOT_FOUND', 'Publication not found');
export class PublicationService {
  constructor(private readonly repository: PublicationRepository, private readonly now = () => new Date()) {}
  async list(ownerId: string, query: PublicationQuery) {
    const rows = await this.repository.list(ownerId, query);
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore: rows.length > query.limit } };
  }
  async get(ownerId: string, id: string) {
    const row = await this.repository.find(ownerId, id);
    if (!row) throw missing();
    return row;
  }
  private async project(ownerId: string, projectId: string | null | undefined) {
    if (projectId && !await this.repository.ownsProject(ownerId, projectId))
      throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  }
  async create(ownerId: string, input: CreatePublication) {
    await this.project(ownerId, input.projectId);
    return this.repository.create(ownerId, input);
  }
  async update(ownerId: string, id: string, input: PatchPublication) {
    await this.get(ownerId, id);
    await this.project(ownerId, input.projectId);
    // Send only supplied fields. In particular, status edits never infer or reset publishedAt.
    const data: Partial<PublicationWrite> = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.publishedAt !== undefined ? { publishedAt: input.publishedAt } : {}),
      ...(input.externalUrl !== undefined ? { externalUrl: input.externalUrl } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    };
    const row = await this.repository.update(ownerId, id, data);
    if (!row) throw missing();
    return row;
  }
  private async transition(ownerId: string, id: string, at: Date | null) {
    const row = await this.repository.setArchived(ownerId, id, at);
    if (!row) throw missing();
    return row;
  }
  archive(ownerId: string, id: string) { return this.transition(ownerId, id, this.now()); }
  restore(ownerId: string, id: string) { return this.transition(ownerId, id, null); }
}
export interface PublicationDependencies {
  run<T>(operation: (service: PublicationService) => Promise<T>): Promise<T>;
}
