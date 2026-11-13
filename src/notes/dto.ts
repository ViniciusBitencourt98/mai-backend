import { z } from 'zod';
const title = z.string().trim().min(1).max(200);
export const tagDto = z.string().trim().toLowerCase().min(1).max(50);
const tags = z.array(tagDto).max(20).transform((values) => [...new Set(values)]);
const fields = { title, content: z.string().max(50000), tags, projectId: z.uuid().nullable() };
export const createNoteDto = z.object({ ...fields, content: fields.content.default(''), tags: tags.default([]), projectId: fields.projectId.default(null) }).strict();
export const patchNoteDto = z.object(fields).partial().strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
export const noteQueryDto = z.object({
  page: integer(1000000).default(1), limit: integer(100).default(20),
  q: z.string().trim().max(200).optional(),
  tag: tagDto.optional(), projectId: z.uuid().optional(), withoutProject: boolean.default(false),
  includeArchived: boolean.default(false), sort: z.enum(['createdAt', 'updatedAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
}).strict().refine((query) => !(query.projectId && query.withoutProject), 'Conflicting project filters');
export const noteIdDto = z.uuid();
export type CreateNote = z.infer<typeof createNoteDto>;
export type PatchNote = z.infer<typeof patchNoteDto>;
export type NoteQuery = z.infer<typeof noteQueryDto>;
export interface NoteRecord {
  id: string; title: string; content: string; tags: string[]; ownerId: string; projectId: string | null;
  createdAt: Date; updatedAt: Date; archivedAt: Date | null;
}
export function noteResponse(note: NoteRecord) {
  return { ...note, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), archivedAt: note.archivedAt?.toISOString() ?? null };
}
