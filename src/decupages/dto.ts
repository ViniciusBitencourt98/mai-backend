import { z } from 'zod';
const title = z.string().trim().min(1).max(200);
export const tagDto = z.string().trim().toLowerCase().min(1).max(50);
const tags = z.array(tagDto).max(20).transform((values) => [...new Set(values)]);
const fields = { title, description: z.string().max(50000).nullable(), tags, projectId: z.uuid().nullable() };
export const createDecupageDto = z.object({ ...fields, description: fields.description.default(null), tags: tags.default([]), projectId: fields.projectId.default(null) }).strict();
export const patchDecupageDto = z.object(fields).partial().strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
export const decupageQueryDto = z.object({
  page: integer(1000000).default(1), limit: integer(100).default(20),
  q: z.string().trim().max(200).optional(),
  tag: tagDto.optional(), projectId: z.uuid().optional(), withoutProject: boolean.default(false),
  includeArchived: boolean.default(false), sort: z.enum(['createdAt', 'updatedAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).strict().refine((query) => !(query.projectId && query.withoutProject), 'Conflicting project filters');
export const decupageIdDto = z.uuid();
export type CreateDecupage = z.infer<typeof createDecupageDto>;
export type PatchDecupage = z.infer<typeof patchDecupageDto>;
export type DecupageQuery = z.infer<typeof decupageQueryDto>;
export interface DecupageRecord {
  id: string; title: string; description: string | null; tags: string[]; ownerId: string; projectId: string | null;
  createdAt: Date; updatedAt: Date; archivedAt: Date | null;
}
export function decupageResponse<T extends DecupageRecord>(decupage: T) {
  return { ...decupage, createdAt: decupage.createdAt.toISOString(), updatedAt: decupage.updatedAt.toISOString(), archivedAt: decupage.archivedAt?.toISOString() ?? null };
}

// Relative media offsets, not wall-clock dates. PostgreSQL signed INT range.
export const timecodeDto = z.number().int().min(0).max(2147483647);
const segmentFields = { startMs: timecodeDto, endMs: timecodeDto.nullable().optional(), description: z.string().max(10000) };
export const createSegmentDto = z.object({ ...segmentFields, description: segmentFields.description.default('') }).strict();
export const patchSegmentDto = z.object(segmentFields).partial().strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
export const reorderSegmentsDto = z.object({ segmentIds: z.array(z.uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, 'Duplicate segment IDs') }).strict();
export type CreateSegment = z.infer<typeof createSegmentDto>;
export type PatchSegment = z.infer<typeof patchSegmentDto>;
export interface SegmentRecord {
  id: string; decupageId: string; position: number; startMs: number; endMs: number | null;
  description: string; createdAt: Date; updatedAt: Date;
}
export function segmentResponse(segment: SegmentRecord) {
  return { ...segment, createdAt: segment.createdAt.toISOString(), updatedAt: segment.updatedAt.toISOString() };
}
