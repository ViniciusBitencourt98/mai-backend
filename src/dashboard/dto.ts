import { z } from 'zod';
import { dateDto } from '../recurrence/dto';
import type { CalendarItem } from '../calendar/dto';
export const dashboardQueryDto = z.object({
  date: dateDto.optional(),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(20)).default(10),
}).strict();
export type DashboardQuery = z.infer<typeof dashboardQueryDto>;
export type DashboardTask = Extract<CalendarItem, { type: 'TASK' }>;
export interface DashboardList<T extends CalendarItem = CalendarItem> { items: T[]; hasMore: boolean; }
