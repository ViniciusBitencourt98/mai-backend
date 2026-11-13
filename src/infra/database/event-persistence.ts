import type { PrismaClient, Prisma } from '../../generated/prisma/client';
import type { EventRepository } from '../../repositories/event.repository';
import type { EventSnapshot, EventRule } from '../../events/dto';
import { civilDate } from '../../tasks/dto';
import { HttpError } from '../../errors/http-error';
export function createEventRepository(client:PrismaClient):EventRepository {
  async function snapshot(tx:Prisma.TransactionClient,ownerId:string,id:string,ruleId?:string):Promise<EventSnapshot>{
    const event=await tx.event.findFirst({where:{id,ownerId}});if(!event)throw new HttpError(404,'NOT_FOUND','Event not found');
    const rows=await tx.eventRecurrence.findMany({where:{eventId:id},orderBy:{version:'desc'},take:101});if(rows.length>100)throw new HttpError(409,'EVENT_LIMIT','Maximum 100 rule versions');
    const selected=ruleId??rows[0]?.id;const overrides=selected?await tx.eventException.findMany({where:{ruleId:selected,rule:{eventId:id}},take:10001}):[];
    if(overrides.length>10000)throw new HttpError(409,'EVENT_LIMIT','Exception limit');
    const rules:EventRule[]=rows.map((row)=>({...row,startDate:row.startDate.toISOString().slice(0,10),endDate:row.endDate?.toISOString().slice(0,10)??null}));
    return {event,rules,exceptions:overrides.map((row)=>({...row,date:row.date.toISOString().slice(0,10)}))};
  }
  async function write<T>(operation:()=>Promise<T>){try{return await operation();}catch(error){if(typeof error==='object'&&error!==null&&'code'in error&&error.code==='P2003')throw new HttpError(404,'NOT_FOUND','Project not found');throw error;}}
  return {
    list(ownerId,q){return client.event.findMany({where:{ownerId,...(!q.includeArchived?{archivedAt:null}:{}),...(q.q?{title:{contains:q.q.replace(/[\\%_]/g,'\\$&'),mode:'insensitive'}}:{}),...(q.projectId?{projectId:q.projectId}:{}),...(q.from?{endAt:{gt:q.from}}:{}),...(q.to?{startAt:{lt:q.to}}:{})},orderBy:[{[q.sort]:q.order},{id:'asc'}],skip:(q.page-1)*q.limit,take:q.limit+1});},
    async ownsProject(ownerId,id){return Boolean(await client.project.findFirst({where:{id,ownerId},select:{id:true}}));},
    create(ownerId,data){return write(()=>client.event.create({data:{...data,ownerId}}));},
    read(ownerId,id,ruleId){return client.$transaction((tx)=>snapshot(tx,ownerId,id,ruleId),{isolationLevel:'RepeatableRead'});},
    mutate(ownerId,id,operation){return write(()=>client.$transaction(async(tx)=>{
      const locked=await tx.event.updateMany({where:{id,ownerId},data:{updatedAt:new Date()}});if(!locked.count)throw new HttpError(404,'NOT_FOUND','Event not found');
      const before=await snapshot(tx,ownerId,id);const {change,result}=operation(before);
      if(change.event){const e=change.event;await tx.event.updateMany({where:{id,ownerId},data:{title:e.title,description:e.description,startAt:e.startAt,endAt:e.endAt,timezone:e.timezone,location:e.location,projectId:e.projectId,archivedAt:e.archivedAt,updatedAt:e.updatedAt}});}
      if(change.rule){const {id:ruleId,eventId:_eventId,...rule}=change.rule;void _eventId;const data={...rule,startDate:civilDate(rule.startDate)!,endDate:civilDate(rule.endDate)};
        if(before.rules.some((r)=>r.id===ruleId))await tx.eventRecurrence.update({where:{id:ruleId},data});else{if(before.rules.length>=100)throw new HttpError(409,'EVENT_LIMIT','Maximum 100 versions');await tx.eventRecurrence.create({data:{...data,id:ruleId,eventId:id}});}}
      if(change.exception){const {ruleId,date,...data}=change.exception;const key={ruleId,date:civilDate(date)!};await tx.eventException.upsert({where:{ruleId_date:key},create:{...key,...data},update:data});}
      return result;
    },{timeout:15000,maxWait:10000}));}
  };
}
