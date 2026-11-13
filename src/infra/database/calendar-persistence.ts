import type { PrismaClient } from '../../generated/prisma/client';
import type { CalendarRepository } from '../../calendar/dto';
import { civilDate } from '../../tasks/dto';
export function createCalendarRepository(client:PrismaClient):CalendarRepository {
 return {
  async tasks(ownerId,from,to){
   const rows=await client.task.findMany({where:{ownerId,archivedAt:null,status:{not:'CANCELLED'},OR:[{recurrenceRules:{some:{}}},{recurrenceRules:{none:{}},dueDate:{gte:civilDate(from)!,lte:civilDate(to)!}}]},take:101,orderBy:{id:'asc'},select:{id:true,title:true,dueDate:true,status:true,recurrenceRules:{orderBy:{version:'desc'},take:1,select:{id:true,version:true,timezone:true,occurrences:{take:10001,select:{date:true}}}}}});
   return rows.map((r)=>({timezone:'UTC',id:r.id,title:r.title,date:r.dueDate?.toISOString().slice(0,10)??null,completed:r.status==='COMPLETED',startAt:null,endAt:null,rule:r.recurrenceRules[0]?{...r.recurrenceRules[0],modifiedDates:r.recurrenceRules[0].occurrences.map((o)=>o.date.toISOString().slice(0,10))}:null}));
  },
  async events(ownerId,from,to){
   const rows=await client.event.findMany({where:{ownerId,archivedAt:null,OR:[{recurrenceRules:{some:{}}},{recurrenceRules:{none:{}},startAt:{lt:to},endAt:{gt:from}}]},take:101,orderBy:{id:'asc'},select:{id:true,title:true,timezone:true,startAt:true,endAt:true,recurrenceRules:{orderBy:{version:'desc'},take:1,select:{id:true,version:true,timezone:true,exceptions:{take:10001,select:{date:true}}}}}});
   return rows.map((r)=>({timezone:r.timezone,id:r.id,title:r.title,date:null,completed:false,startAt:r.startAt.toISOString(),endAt:r.endAt.toISOString(),rule:r.recurrenceRules[0]?{...r.recurrenceRules[0],modifiedDates:r.recurrenceRules[0].exceptions.map((o)=>o.date.toISOString().slice(0,10))}:null}));
  }
 };
}
