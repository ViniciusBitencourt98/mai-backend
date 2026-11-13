import { segmentResponse, type CreateSegment, type PatchSegment, type SegmentRecord } from '../decupages/dto';
import { HttpError } from '../errors/http-error';
import type { CreateDecupage, PatchDecupage, DecupageQuery } from '../decupages/dto';
import type { DecupageRepository, DecupageWrite } from '../repositories/decupage.repository';
const missing = () => new HttpError(404, 'NOT_FOUND', 'Decupage not found');
export class DecupageService {
  constructor(private readonly repository: DecupageRepository, private readonly now = () => new Date()) {}
  async list(ownerId: string, query: DecupageQuery) {
    const rows = await this.repository.list(ownerId, query);
    return { items: rows.slice(0, query.limit), page: { number: query.page, limit: query.limit, hasMore: rows.length > query.limit } };
  }
  async get(ownerId: string, id: string) {
    const decupage = await this.repository.find(ownerId, id);
    if (!decupage) throw missing();
    return { ...decupage, segments: (await this.repository.listSegments(ownerId, id) ?? []).map(segmentResponse) };
  }
  private async project(ownerId: string, projectId: string | null | undefined) {
    if (projectId && !await this.repository.ownsProject(ownerId, projectId))
      throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  }
  async create(ownerId: string, input: CreateDecupage) {
    await this.project(ownerId, input.projectId);
    return this.repository.create(ownerId, input);
  }
  async update(ownerId: string, id: string, input: PatchDecupage) {
    await this.get(ownerId, id);
    await this.project(ownerId, input.projectId);
    const data: Partial<DecupageWrite> = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    };
    const decupage = await this.repository.update(ownerId, id, data);
    if (!decupage) throw missing();
    return decupage;
  }
  private validSegment(segment: Pick<SegmentRecord, 'startMs' | 'endMs'>) {
    if (segment.endMs !== null && segment.endMs < segment.startMs)
      throw new HttpError(400, 'VALIDATION_ERROR', 'endMs must be on or after startMs');
  }
  async addSegment(ownerId: string, id: string, input: CreateSegment) {
    const endMs = input.endMs ?? null;
    this.validSegment({ startMs: input.startMs, endMs });
    return this.repository.mutateSegments(ownerId, id, (segments) => {
      if (segments.length >= 100) throw new HttpError(409, 'SEGMENT_LIMIT', 'Maximum 100 segments per decupage');
      const now = this.now();
      return [...segments, { id: crypto.randomUUID(), decupageId: id, position: segments.length,
        startMs: input.startMs, endMs, description: input.description, createdAt: now, updatedAt: now }];
    });
  }
  updateSegment(ownerId: string, id: string, segmentId: string, input: PatchSegment) {
    return this.repository.mutateSegments(ownerId, id, (segments) => {
      const current = segments.find((segment) => segment.id === segmentId);
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'Segment not found');
      const next: SegmentRecord = { ...current, updatedAt: this.now(),
        ...(input.startMs !== undefined ? { startMs: input.startMs } : {}),
        ...(input.endMs !== undefined ? { endMs: input.endMs } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      };
      this.validSegment(next);
      return segments.map((segment) => segment.id === segmentId ? next : segment);
    });
  }
  removeSegment(ownerId: string, id: string, segmentId: string) {
    return this.repository.mutateSegments(ownerId, id, (segments) => {
      if (!segments.some((segment) => segment.id === segmentId)) throw new HttpError(404, 'NOT_FOUND', 'Segment not found');
      return segments.filter((segment) => segment.id !== segmentId).map((segment, position) => ({ ...segment, position,
        updatedAt: segment.position === position ? segment.updatedAt : this.now() }));
    });
  }
  reorderSegments(ownerId: string, id: string, ids: string[]) {
    return this.repository.mutateSegments(ownerId, id, (segments) => {
      if (ids.length !== segments.length || new Set(ids).size !== ids.length || ids.some((value) => !segments.some((segment) => segment.id === value)))
        throw new HttpError(400, 'VALIDATION_ERROR', 'Provide each existing segment exactly once');
      return ids.map((value, position) => {
        const segment = segments.find((segment) => segment.id === value)!;
        return { ...segment, position, updatedAt: segment.position === position ? segment.updatedAt : this.now() };
      });
    });
  }
  private async transition(ownerId: string, id: string, at: Date | null) {
    const decupage = await this.repository.setArchived(ownerId, id, at);
    if (!decupage) throw missing();
    return decupage;
  }
  archive(ownerId: string, id: string) { return this.transition(ownerId, id, this.now()); }
  restore(ownerId: string, id: string) { return this.transition(ownerId, id, null); }
}
export interface DecupageDependencies {
  run<T>(operation: (service: DecupageService) => Promise<T>): Promise<T>;
}
