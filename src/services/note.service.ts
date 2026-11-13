import { HttpError } from '../errors/http-error';
import type { CreateNote, PatchNote, NoteQuery } from '../notes/dto';
import type { NoteRepository, NoteWrite } from '../repositories/note.repository';
const missing = () => new HttpError(404, 'NOT_FOUND', 'Note not found');
export class NoteService {
  constructor(private readonly repository: NoteRepository, private readonly now = () => new Date()) {}
  async list(ownerId: string, query: NoteQuery) {
    const rows = await this.repository.list(ownerId, query);
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore: rows.length > query.limit } };
  }
  async get(ownerId: string, id: string) {
    const note = await this.repository.find(ownerId, id);
    if (!note) throw missing();
    return note;
  }
  private async project(ownerId: string, projectId: string | null | undefined) {
    if (projectId && !await this.repository.ownsProject(ownerId, projectId))
      throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  }
  async create(ownerId: string, input: CreateNote) {
    await this.project(ownerId, input.projectId);
    return this.repository.create(ownerId, input);
  }
  async update(ownerId: string, id: string, input: PatchNote) {
    await this.get(ownerId, id);
    await this.project(ownerId, input.projectId);
    const data: Partial<NoteWrite> = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    };
    const note = await this.repository.update(ownerId, id, data);
    if (!note) throw missing();
    return note;
  }
  private async transition(ownerId: string, id: string, at: Date | null) {
    const note = await this.repository.setArchived(ownerId, id, at);
    if (!note) throw missing();
    return note;
  }
  archive(ownerId: string, id: string) { return this.transition(ownerId, id, this.now()); }
  restore(ownerId: string, id: string) { return this.transition(ownerId, id, null); }
}
export interface NoteDependencies {
  run<T>(operation: (service: NoteService) => Promise<T>): Promise<T>;
}
