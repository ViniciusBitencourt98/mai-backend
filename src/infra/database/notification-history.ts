import type { PrismaClient } from '../../generated/prisma/client';
import { publicNotification, type NotificationHistory } from '../../notifications/history';
import { HttpError } from '../../errors/http-error';
import { createDatabaseClient } from './client';
import type { DatabaseBindings } from './config';
export function createNotificationHistory(client:PrismaClient):NotificationHistory {
  return {async list(ownerId,q) {
    const rows = await client.notificationOutbox.findMany({where:{ownerId,...(q.type?{type:q.type}:{}),...(q.status?{status:q.status}:{}),
      ...((q.from||q.to)?{scheduledAt:{...(q.from?{gte:q.from}:{}),...(q.to?{lt:q.to}:{})}}:{})},
      orderBy:[{scheduledAt:q.order},{id:q.order}],skip:(q.page-1)*q.limit,take:q.limit+1});
    return {items:rows.slice(0,q.limit).map(publicNotification),page:{number:q.page,limit:q.limit,hasMore:rows.length>q.limit}};
  },async get(ownerId,id) {
    const row = await client.notificationOutbox.findFirst({where:{id,ownerId}});
    if (!row) throw new HttpError(404,'NOT_FOUND','Notification not found');
    return publicNotification(row);
  }};
}
export function notificationHistoryScope(bindings:DatabaseBindings):NotificationHistory {
  async function run<T>(fn:(service:NotificationHistory)=>Promise<T>) {const client=createDatabaseClient(bindings.DATABASE_URL);try{return await fn(createNotificationHistory(client));}finally{await client.$disconnect();}}
  return {list:(owner,q)=>run(s=>s.list(owner,q)),get:(owner,id)=>run(s=>s.get(owner,id))};
}
