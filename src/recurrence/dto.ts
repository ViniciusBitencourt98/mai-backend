import { z } from 'zod';
export const dateDto = z.iso.date().refine((v) => !v.startsWith('0000'));
export const timezoneDto = z.string().max(100).refine((v) => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return !/^[+-]/.test(v); } catch { return false; } }, 'Use an IANA timezone');
export const ruleFields = { frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_DAYS']), interval: z.number().int().min(1).max(365),
  startDate: dateDto, weekdays: z.array(z.number().int().min(1).max(7)).max(7).refine((v) => new Set(v).size === v.length),
  endDate: dateDto.nullable(), count: z.number().int().min(1).max(10000).nullable(), timezone: timezoneDto };
export const createRuleDto = z.object({ ...ruleFields, interval: ruleFields.interval.default(1), weekdays: ruleFields.weekdays.default([]), endDate: ruleFields.endDate.default(null), count: ruleFields.count.default(null) }).strict();
export const patchRuleDto = z.object(ruleFields).partial().strict().refine((v) => Object.keys(v).length > 0);
export const occurrenceQueryDto = z.object({ from: dateDto, to: dateDto, ruleId: z.uuid().optional(),
  after: dateDto.optional(), limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(100) }).strict()
  .refine((q) => q.from <= q.to && (Date.parse(q.to)-Date.parse(q.from))/86400000 <= 365, 'Window maximum 366 days')
  .refine((q) => !q.after || q.after >= q.from && q.after <= q.to, 'Cursor outside window');
export type RuleInput = z.infer<typeof createRuleDto>;
export type RulePatch = z.infer<typeof patchRuleDto>;
export type OccurrenceQuery = z.infer<typeof occurrenceQueryDto>;
export interface RuleRecord extends RuleInput { id: string; taskId: string; version: number; state: 'ACTIVE' | 'PAUSED' | 'ENDED'; createdAt: Date; updatedAt: Date; }
export interface OccurrenceRecord { ruleId: string; date: string; completedAt: Date | null; updatedAt: Date; }
export interface RecurrenceSnapshot { archived: boolean; current: RuleRecord | null; rules: RuleRecord[]; occurrences: OccurrenceRecord[]; }
export interface RecurrenceChange { rule?: RuleRecord; occurrence?: OccurrenceRecord; event?: { ruleId: string; date: string; completed: boolean; at: Date }; }
export function ruleResponse(rule: RuleRecord) { return { ...rule, createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString() }; }
