import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { createNotificationHistory } from '../../src/infra/database/notification-history';
import { historyQueryDto,publicNotification } from '../../src/notifications/history';
import type { OutboxRecord } from '../../src/notifications/dto';
import { planDigests } from '../../src/infra/database/digest-planner';
import type { NotificationService } from '../../src/services/notification.service';
it('filters history by owner, type, status, half-open scheduled interval, stable ordering and pagination',async()=>{
 const now=new Date(),row={id:randomUUID(),createdAt:now,updatedAt:now,scheduledAt:now,leaseToken:'private',ownerId:randomUUID()} as OutboxRecord;
 const findMany=vi.fn().mockResolvedValue([row,row]),findFirst=vi.fn().mockResolvedValue(null);
 const history=createNotificationHistory({notificationOutbox:{findMany,findFirst}} as unknown as PrismaClient);
 const query=historyQueryDto.parse({page:'2',limit:'1',type:'TASK_REMINDER',status:'SENT',from:'2026-11-01T00:00:00Z',to:'2026-12-01T00:00:00Z',order:'asc'});
 const result=await history.list(row.ownerId,query);expect(result.page).toEqual({number:2,limit:1,hasMore:true});expect(result.items).toHaveLength(1);
 expect(findMany).toHaveBeenCalledWith({where:{ownerId:row.ownerId,type:'TASK_REMINDER',status:'SENT',scheduledAt:{gte:query.from,lt:query.to}},orderBy:[{scheduledAt:'asc'},{id:'asc'}],skip:1,take:2});
 expect(publicNotification(row)).not.toHaveProperty('leaseToken');expect(publicNotification(row)).not.toHaveProperty('ownerId');
 await expect(history.get('other',row.id)).rejects.toMatchObject({status:404});expect(findFirst).toHaveBeenCalledWith({where:{id:row.id,ownerId:'other'}});
});
it.each([{limit:'101'},{page:'0'},{ownerId:'injected'},{status:['SENT']},{from:'invalid'},{type:'OTHER'},{from:'2026-12-01T00:00:00Z',to:'2026-11-01T00:00:00Z'}])('rejects invalid history query %#',input=>expect(historyQueryDto.safeParse(input).success).toBe(false));
it('planner uses local day, due time, skips DST gaps and delegates persistent daily idempotency',async()=>{
 const createDigest=vi.fn();const query=vi.fn().mockResolvedValue([{id:'a',timezone:'America/Sao_Paulo',time:'08:00'},{id:'b',timezone:'America/Sao_Paulo',time:'12:00'}]);
 await planDigests({$queryRaw:query} as unknown as PrismaClient,{createDigest} as unknown as NotificationService,new Date('2026-11-15T11:01:00Z'));
 expect(createDigest).toHaveBeenCalledExactlyOnceWith('a',{date:'2026-11-15'},true);
 const sql=query.mock.calls[0]![0].join(' ');expect(sql).toContain('NOT EXISTS');expect(sql).toContain('p.email_enabled AND p.daily_digest_enabled');expect(sql).toContain('LIMIT 100');
 createDigest.mockClear();query.mockResolvedValue([{id:'a',timezone:'America/New_York',time:'02:30'}]);
 await planDigests({$queryRaw:query} as unknown as PrismaClient,{createDigest} as unknown as NotificationService,new Date('2026-03-08T12:00:00Z'));expect(createDigest).not.toHaveBeenCalled();
});
