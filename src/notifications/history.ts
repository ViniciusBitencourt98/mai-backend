import { z } from 'zod';
import { notificationStatusDto, type OutboxRecord } from './dto';
const integer = (max:number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
export const historyQueryDto = z.object({page:integer(10000).default(1),limit:integer(100).default(20),
  type:z.enum(['TASK_REMINDER','EVENT_REMINDER','PUBLICATION_REMINDER','DAILY_DIGEST']).optional(),status:notificationStatusDto.optional(),
  from:z.iso.datetime({offset:true}).transform(s=>new Date(s)).optional(),to:z.iso.datetime({offset:true}).transform(s=>new Date(s)).optional(),
  order:z.enum(['asc','desc']).default('desc')}).strict().refine(q=>!q.from||!q.to||q.from<q.to,'Invalid period');
export type HistoryQuery = z.infer<typeof historyQueryDto>;
export function publicNotification(row:OutboxRecord) {
  return {id:row.id,type:row.type,sourceType:row.sourceType,sourceId:row.sourceId,occurrenceDate:row.occurrenceDate?.toISOString().slice(0,10)??null,
    status:row.status,scheduledAt:row.scheduledAt.toISOString(),publishedAt:row.publishedAt?.toISOString()??null,
    sentAt:row.sentAt?.toISOString()??null,failedAt:row.failedAt?.toISOString()??null,cancelledAt:row.cancelledAt?.toISOString()??null,
    errorCategory:row.lastError,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
}
export interface NotificationHistory {
  list(owner:string,query:HistoryQuery):Promise<{items:ReturnType<typeof publicNotification>[];page:{number:number;limit:number;hasMore:boolean}}>;
  get(owner:string,id:string):Promise<ReturnType<typeof publicNotification>>;
}
