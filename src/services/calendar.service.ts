import type { CalendarRepository,CalendarItem,CalendarMaster,CalendarQuery } from '../calendar/dto';
import type { RecurrenceDependencies } from './recurrence.service';
import type { EventDependencies } from './event.service';
import { localToday } from '../tasks/dto';
import { occurrenceQueryDto } from '../recurrence/dto';
import { eventOccurrenceQueryDto } from '../events/dto';
import { HttpError } from '../errors/http-error';
export class CalendarService {
 constructor(private readonly repository:CalendarRepository,private readonly recurrence:RecurrenceDependencies,private readonly events:EventDependencies){}
 async list(ownerId:string,q:CalendarQuery,timezone:string){
  const items:CalendarItem[]=[];let expanded=0;
  const capacity=(count=0)=>{expanded+=count;if(expanded>10000||items.length>10000)throw new HttpError(409,'CALENDAR_LIMIT','Maximum 10000 calendar items; narrow the window');};
  const origin=(m:CalendarMaster,date:string|null)=>({timezone:m.rule?.timezone??m.timezone,id:date?`${m.rule!.id}:${date}`:m.id,masterId:m.id,ruleId:m.rule?.id??null,version:m.rule?.version??null,occurrenceDate:date,title:m.title,recurring:m.rule!==null,modified:date?m.rule!.modifiedDates.includes(date):false});
  if(q.types.includes('TASK')){
   const from=localToday(q.from,timezone),to=localToday(new Date(q.to.getTime()-1),timezone);
   const masters=await this.repository.tasks(ownerId,from,to);this.bound(masters);
   for(const m of masters){
    if(!m.rule){if(m.date)items.push({...origin(m,null),timezone,type:'TASK',date:m.date,completed:m.completed,href:'/tasks/'+m.id});}
    else {const fromDate=localToday(q.from,m.rule.timezone),toDate=localToday(new Date(q.to.getTime()-1),m.rule.timezone);let after:string|undefined;
     do{const page=await this.recurrence.run((s)=>s.occurrences(ownerId,m.id,occurrenceQueryDto.parse({from:fromDate,to:toDate,ruleId:m.rule!.id,limit:'100',...(after?{after}:{})})));
      for(const o of page.items)items.push({...origin(m,o.date),type:'TASK',date:o.date,completed:o.completedAt!==null,href:'/tasks/'+m.id});capacity(page.items.length);after=page.page.nextAfter??undefined;
     }while(after);
    }capacity();
   }
  }
  if(q.types.includes('EVENT')){
   const masters=await this.repository.events(ownerId,q.from,q.to);this.bound(masters);
   for(const m of masters){
    if(!m.rule){items.push({...origin(m,null),type:'EVENT',startAt:m.startAt!,endAt:m.endAt!,href:'/events/'+m.id});}
    else {let page=1,more:boolean;do{
     const result=await this.events.run((s)=>s.occurrences(ownerId,m.id,eventOccurrenceQueryDto.parse({from:q.from.toISOString(),to:q.to.toISOString(),ruleId:m.rule!.id,limit:'100',page:String(page)})));
     for(const o of result.items)if(!o.cancelled)items.push({...origin(m,o.date),title:o.title,type:'EVENT',startAt:o.startAt,endAt:o.endAt,href:'/events/'+m.id});capacity(result.items.length);more=result.page.hasMore;page++;
     if(page>101)throw new HttpError(409,'CALENDAR_LIMIT','Expansion limit');
    }while(more);}capacity();
   }
  }
  items.sort((a,b)=>{const x=a.type==='TASK'?a.date:a.startAt,y=b.type==='TASK'?b.date:b.startAt;return x.localeCompare(y)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id);});
  const offset=(q.page-1)*q.limit;return {items:items.slice(offset,offset+q.limit),page:{number:q.page,limit:q.limit,hasMore:items.length>offset+q.limit},timezone};
 }
 private bound(masters:CalendarMaster[]){if(masters.length>100)throw new HttpError(409,'CALENDAR_LIMIT','Maximum 100 matching masters per type; use types or narrow the window');}
}
export interface CalendarDependencies {run<T>(operation:(service:CalendarService)=>Promise<T>):Promise<T>;}
