import { z } from 'zod';
export const taskStatusDto = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const taskPriorityDto = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const date = z.iso.date().refine((value) => !value.startsWith('0000'), 'Year must be at least 0001');
const title = z.string().trim().min(1).max(200);
const fields = { title, description: z.string().max(50000).nullable(), status: taskStatusDto,
  priority: taskPriorityDto, startDate: date.nullable(), dueDate: date.nullable(), projectId: z.uuid().nullable() };
export const createTaskDto = z.object({ ...fields, description: fields.description.default(null), status: taskStatusDto.default('PENDING'),
  priority: taskPriorityDto.default('MEDIUM'), startDate: fields.startDate.default(null), dueDate: fields.dueDate.default(null), projectId: fields.projectId.default(null) }).strict();
export const patchTaskDto = z.object(fields).partial().strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
export const taskQueryDto = z.object({ page: integer(1000000).default(1), limit: integer(100).default(20),
  q: z.string().trim().max(200).optional(), status: taskStatusDto.optional(), priority: taskPriorityDto.optional(),
  projectId: z.uuid().optional(), withoutProject: boolean.default(false), dueFrom: date.optional(), dueTo: date.optional(),
  withoutDueDate: boolean.default(false), overdue: boolean.default(false), includeArchived: boolean.default(false),
  sort: z.enum(['createdAt', 'updatedAt', 'priority', 'dueDate']).default('updatedAt'), order: z.enum(['asc', 'desc']).default('desc'),
}).strict().refine((q) => !(q.projectId && q.withoutProject), 'Conflicting project filters')
  .refine((q) => !(q.withoutDueDate && (q.dueFrom || q.dueTo || q.overdue)), 'Conflicting date filters')
  .refine((q) => !q.dueFrom || !q.dueTo || q.dueFrom <= q.dueTo, 'Invalid date interval');
export const taskIdDto = z.uuid();
export const createSubtaskDto = z.object({ title, completed: z.boolean().default(false) }).strict();
export const patchSubtaskDto = z.object({ title: title.optional(), completed: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0);
export const reorderSubtasksDto = z.object({ subtaskIds: z.array(z.uuid()).max(100).refine((ids) => new Set(ids).size === ids.length) }).strict();
export type CreateTask = z.infer<typeof createTaskDto>;
export type PatchTask = z.infer<typeof patchTaskDto>;
export type TaskQuery = z.infer<typeof taskQueryDto>;
export type CreateSubtask = z.infer<typeof createSubtaskDto>;
export type PatchSubtask = z.infer<typeof patchSubtaskDto>;
export interface TaskRecord { id: string; title: string; description: string | null; status: z.infer<typeof taskStatusDto>;
  priority: z.infer<typeof taskPriorityDto>; startDate: Date | null; dueDate: Date | null; completedAt: Date | null;
  ownerId: string; projectId: string | null; createdAt: Date; updatedAt: Date; archivedAt: Date | null; }
export interface SubtaskRecord { id: string; taskId: string; title: string; completed: boolean; position: number; createdAt: Date; updatedAt: Date; }
export function taskResponse<T extends TaskRecord>(task: T) {
  return { ...task, startDate: task.startDate?.toISOString().slice(0, 10) ?? null, dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    completedAt: task.completedAt?.toISOString() ?? null, archivedAt: task.archivedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() };
}
export function subtaskResponse(row: SubtaskRecord) { return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
export const civilDate = (value: string | null) => value === null ? null : new Date(value + 'T00:00:00.000Z');
export function localToday(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
