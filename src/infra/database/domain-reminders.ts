import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { SourceRef } from '../../notifications/dto';
import { NotificationService } from '../../services/notification.service';
import { createNotificationTransactionRepository } from './notification-persistence';
import { notificationSource, lockNotificationSource } from './notification-source';
import { preferenceDefaults } from '../../preferences/dto';
import { schedule } from '../../recurrence/engine';
import { HttpError } from '../../errors/http-error';
type Tx = Prisma.TransactionClient;
export async function lockReminderOwner(tx: Tx, owner: string) {
  const rows = await tx.$queryRaw<{id:string}[]>`SELECT id FROM users WHERE id=${owner}::uuid AND disabled_at IS NULL FOR UPDATE`;
  if (!rows.length) throw new HttpError(401,'UNAUTHENTICATED','Authentication required');
}
/** Synchronize only this source in the caller's transaction, never a separate commit. */
export async function synchronizeReminders(tx: Tx, owner: string, ref: SourceRef, now = new Date()) {
  const rule = await tx.reminderRule.findUnique({where:{ownerId_sourceType_sourceId:{ownerId:owner,...ref}}});
  if (!rule) return;
  const service = new NotificationService(createNotificationTransactionRepository(tx),()=>now);
  const active = await tx.notificationOutbox.findMany({where:{ownerId:owner,reminderRuleId:rule.id,status:{in:['PENDING','RESERVED','PUBLISHED']}},take:101,orderBy:{id:'asc'}});
  if (active.length>100) throw new HttpError(409,'NOTIFICATION_LIMIT','Maximum 100 active reminders per rule');
  for (const row of active) await service.invalidate(owner,row.id);
  const preferences = await tx.userPreferences.findUnique({where:{userId:owner},select:{timezone:true,emailEnabled:true,dailyDigestEnabled:true,dailyDigestTime:true}}) ?? preferenceDefaults;
  if (!rule.enabled || !preferences.emailEnabled) return;
  const recurring = ref.sourceType==='TASK' ? await tx.taskRecurrence.findFirst({where:{taskId:ref.sourceId},orderBy:{version:'desc'}})
    : ref.sourceType==='EVENT' ? await tx.eventRecurrence.findFirst({where:{eventId:ref.sourceId},orderBy:{version:'desc'}}) : null;
  let dates: (string|undefined)[] = [undefined];
  if(recurring){
    if(recurring.state!=='ACTIVE') return;
    const lower=new Date(now.getTime()-2*86400000).toISOString().slice(0,10), upper=new Date(now.getTime()+62*86400000).toISOString().slice(0,10);
    dates=schedule({...recurring,startDate:recurring.startDate.toISOString().slice(0,10),endDate:recurring.endDate?.toISOString().slice(0,10)??null}).filter(date=>date>=lower&&date<=upper);
    if(ref.sourceType==='EVENT'){
      const moved=await tx.eventException.findMany({where:{ruleId:recurring.id,cancelled:false,startAt:{gte:now,lte:new Date(now.getTime()+60*86400000)}},select:{date:true},take:101});
      if(moved.length>100)throw new HttpError(409,'NOTIFICATION_LIMIT','Exception planning limit');
      dates=[...new Set([...dates,...moved.map(e=>e.date.toISOString().slice(0,10))])];
    }
  }
  if(dates.length>100)throw new HttpError(409,'NOTIFICATION_LIMIT','Reminder planning limit');
  for(const date of dates){
    const source=await notificationSource(tx,owner,ref,preferences,date);
    if(!source)continue;
    const send=source.at.getTime()-rule.leadMinutes*60000;
    if(send<now.getTime()||send>now.getTime()+30*86400000)continue;
    await service.createReminder(owner,{reminderRuleId:rule.id,...(date?{occurrenceDate:date}:{})});
  }
}
/** Existing repositories can reuse their callbacks through this facade without nested Prisma transactions. */
export function reminderTransactionClient(tx: Tx): PrismaClient {
  return new Proxy(tx,{get(target,key){if(key==='$transaction')return (operation:(inner:Tx)=>Promise<unknown>)=>operation(tx);return Reflect.get(target,key);}}) as PrismaClient;
}
export function withDomainReminders<T extends object>(client:PrismaClient,factory:(client:PrismaClient)=>T,sourceType:SourceRef['sourceType'],writes:readonly string[]):T {
  const original=factory(client);
  return new Proxy(original,{get(target,key){
    const value=Reflect.get(target,key);if(typeof key!=='string'||!writes.includes(key))return value;
    return (...args:unknown[])=>client.$transaction(async(tx)=>{
      const owner=args[0] as string;await lockReminderOwner(tx,owner);
      const repository=factory(reminderTransactionClient(tx));
      const method: unknown=Reflect.get(repository,key);
      if(typeof method!=='function')throw new Error('Invalid repository mutation');
      const result=await Reflect.apply(method,repository,args);
      const id=key==='create'?(result as {id:string}).id:args[1] as string;
      await synchronizeReminders(tx,owner,{sourceType,sourceId:id});return result;
    },{timeout:30000,maxWait:10000});
  }});
}
export async function synchronizeOwnerReminders(tx:Tx,owner:string){
  const rules=await tx.reminderRule.findMany({where:{ownerId:owner},orderBy:{id:'asc'},take:101});
  if(rules.length>100)throw new HttpError(409,'NOTIFICATION_LIMIT','Preference change exceeds 100 reminder rules');
  for(const rule of rules)await synchronizeReminders(tx,owner,rule);
  // Digest generation remains a separate future component; invalidate existing live digests only.
  const rows=await tx.notificationOutbox.findMany({where:{ownerId:owner,type:'DAILY_DIGEST',status:{in:['PENDING','RESERVED','PUBLISHED']}},take:101});
  if(rows.length>100)throw new HttpError(409,'NOTIFICATION_LIMIT','Digest invalidation limit');
  const service=new NotificationService(createNotificationTransactionRepository(tx));
  for(const row of rows)await service.invalidate(owner,row.id);
}
export async function getReminder(tx:Tx,owner:string,ref:SourceRef){
  if(!await lockNotificationSource(tx,owner,ref))throw new HttpError(404,'NOT_FOUND','Reminder source not found');
  return tx.reminderRule.findUnique({where:{ownerId_sourceType_sourceId:{ownerId:owner,...ref}},select:{id:true,sourceType:true,sourceId:true,leadMinutes:true,enabled:true,version:true,createdAt:true,updatedAt:true}});
}
