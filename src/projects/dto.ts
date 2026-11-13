import { z } from 'zod';

export const projectStatus = z.enum(['ACTIVE', 'ARCHIVED']);
const fields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
};
export const createProjectDto = z.object({ ...fields, status: projectStatus.default('ACTIVE') }).strict();
export const patchProjectDto = z.object({ ...fields, name: fields.name.optional(), status: projectStatus.optional() })
  .strict().refine((input) => Object.keys(input).length > 0, 'Provide at least one field');
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
export const projectQueryDto = z.object({
  page: integer(1000000).default(1),
  limit: integer(100).default(20),
  status: projectStatus.optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['name', 'createdAt', 'updatedAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  includeArchived: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
}).strict();
export const projectIdDto = z.uuid();
export type CreateProject = z.infer<typeof createProjectDto>;
export type PatchProject = z.infer<typeof patchProjectDto>;
export type ProjectQuery = z.infer<typeof projectQueryDto>;
export interface ProjectRecord {
  id: string; ownerId: string; name: string; description: string | null;
  status: z.infer<typeof projectStatus>; color: string | null;
  startDate: Date | null; dueDate: Date | null;
  createdAt: Date; updatedAt: Date; archivedAt: Date | null;
}
export function projectResponse(project: ProjectRecord) {
  return { ...project, startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
    dueDate: project.dueDate?.toISOString().slice(0, 10) ?? null,
    createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null };
}
