import { z } from 'zod';
import { createRuleDto, patchRuleDto, timezoneDto, dateDto, type RuleRecord } from '../recurrence/dto';
export const instantDto = z.iso.datetime({ offset: true }).refine((s) => !s.startsWith('0000') && !/\.\d{4}/.test(s))
  .transform((s) => new Date(s)).refine((d) => Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 1 && d.getUTCFullYear() <= 9999);
const title = z.string().trim().min(1).max(200);
const fields = { title, description: z.string().max(50000).nullable(), startAt: instantDto, endAt: instantDto, timezone: timezoneDto,
  location: z.string().max(1000).nullable(), projectId: z.uuid().nullable() };
export const createEventDto = z.object({ ...fields, description: fields.description.default(null), location: fields.location.default(null), projectId: fields.projectId.default(null) }).strict();
export const patchEventDto = z.object(fields).partial().strict().refine((v) => Object.keys(v).length > 0);
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const pagination = { page: integer(1000000).default(1), limit: integer(100).default(20) };
export const eventQueryDto = z.object({ ...pagination, q: z.string().trim().max(200).optional(), projectId: z.uuid().optional(),
  from: instantDto.optional(), to: instantDto.optional(), includeArchived: z.enum(['true', 'false']).transform((v) => v === 'true').default(false),
  sort: z.enum(['startAt','endAt','createdAt','updatedAt']).default('startAt'), order: z.enum(['asc','desc']).default('asc'),
}).strict().refine((q) => !q.from || !q.to || q.from < q.to);
export const createEventRuleDto = createRuleDto;
export const patchEventRuleDto = patchRuleDto.safeExtend({ anchorStartAt: instantDto.optional(), anchorEndAt: instantDto.optional() });
export const eventOccurrenceQueryDto = z.object({ ...pagination, from: instantDto, to: instantDto, ruleId: z.uuid().optional() }).strict()
  .refine((q) => q.from < q.to && q.to.getTime() - q.from.getTime() <= 366 * 86400000);
export const occurrencePatchDto = z.object({ title: title.optional(), description: fields.description.optional(),
  location: fields.location.optional(), startAt: instantDto.optional(), endAt: instantDto.optional() }).strict().refine((v) => Object.keys(v).length > 0);
export { dateDto };
export type EventInput = z.infer<typeof createEventDto>;
export type EventPatch = z.infer<typeof patchEventDto>;
export type EventQuery = z.infer<typeof eventQueryDto>;
export type EventRulePatch = z.infer<typeof patchEventRuleDto>;
export type EventOccurrenceQuery = z.infer<typeof eventOccurrenceQueryDto>;
export type OccurrencePatch = z.infer<typeof occurrencePatchDto>;
export interface EventRecord extends EventInput { id: string; ownerId: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null; }
export interface EventRule extends Omit<RuleRecord,'taskId'> { eventId: string; anchorStartAt: Date; anchorEndAt: Date; }
export interface EventException { ruleId: string; date: string; title: string; description: string | null; location: string | null; startAt: Date; endAt: Date; cancelled: boolean; updatedAt: Date; }
export interface EventSnapshot { event: EventRecord; rules: EventRule[]; exceptions: EventException[]; }
export interface EventChange { event?: EventInput & { archivedAt: Date | null; updatedAt: Date }; rule?: EventRule; exception?: EventException; }
export function eventResponse(row: EventRecord) { return { ...row, startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null }; }
export function eventRuleResponse(row: EventRule) { return { ...row, anchorStartAt: row.anchorStartAt.toISOString(), anchorEndAt: row.anchorEndAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
export function exceptionResponse(row: EventException) { return { ...row, startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
