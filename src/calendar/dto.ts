import { z } from 'zod';
import { instantDto } from '../events/dto';
import type { PublicationRecord } from '../publications/dto';
export const calendarQueryDto = z.object({ from: instantDto, to: instantDto,
  types: z.string().transform((v) => v.split(',')).pipe(z.array(z.enum(['TASK','EVENT','PUBLICATION'])).min(1).max(3).refine((v) => new Set(v).size === v.length)).default(['TASK','EVENT']),
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10000)).default(1),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(20),
}).strict().refine((q) => q.from < q.to && q.to.getTime()-q.from.getTime() <= 31*86400000,'Window maximum 31 days');
export type CalendarQuery = z.infer<typeof calendarQueryDto>;
interface Origin { timezone:string; id:string; masterId:string; ruleId:string|null; version:number|null; occurrenceDate:string|null; title:string; recurring:boolean; modified:boolean; href:string; }
export type CalendarItem = Origin & ({type:'TASK';date:string;completed:boolean}|{type:'EVENT';startAt:string;endAt:string}|{type:'PUBLICATION';scheduledAt:string;status:PublicationRecord['status'];platform:PublicationRecord['platform'];projectId:string|null});
export interface CalendarMaster { timezone:string; id:string;title:string;date:string|null;completed:boolean;startAt:string|null;endAt:string|null;rule:{id:string;version:number;timezone:string;modifiedDates:string[]}|null; }
export type CalendarPublication = Pick<PublicationRecord, 'id' | 'title' | 'status' | 'platform' | 'projectId'> & { scheduledAt: Date };
export interface CalendarRepository { tasks(ownerId:string,from:string,to:string):Promise<CalendarMaster[]>;events(ownerId:string,from:Date,to:Date):Promise<CalendarMaster[]>;publications(ownerId:string,from:Date,to:Date):Promise<CalendarPublication[]>; }
