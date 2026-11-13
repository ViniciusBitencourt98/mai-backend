import { HttpError } from '../errors/http-error';
import { schedule, validateRule } from '../recurrence/engine';
import { createRuleDto, type RuleInput } from '../recurrence/dto';
import { localStamp, resolveLocal, validTimes, overlaps } from '../events/time';
import { eventResponse, eventRuleResponse, exceptionResponse, type EventInput, type EventPatch, type EventQuery, type EventSnapshot, type EventRule, type EventException, type EventRulePatch, type EventOccurrenceQuery, type OccurrencePatch } from '../events/dto';
import type { EventRepository } from '../repositories/event.repository';
const conflict = (message: string) => new HttpError(409, 'EVENT_CONFLICT', message);
const missing = () => new HttpError(404, 'NOT_FOUND', 'Recurrence or occurrence not found');
function current(snapshot: EventSnapshot) { const rule = snapshot.rules[0]; if (!rule) throw missing(); return rule; }
function editable(snapshot: EventSnapshot) { if (snapshot.event.archivedAt) throw conflict('Restore the event before modifying series or occurrences'); }
function baseOccurrence(snapshot: EventSnapshot, rule: EventRule, date: string): EventException | null {
  const local = localStamp(rule.anchorStartAt, rule.timezone);
  const startAt = resolveLocal(date + local.slice(10), rule.timezone);
  if (!startAt) return null;
  const endAt = new Date(startAt.getTime() + rule.anchorEndAt.getTime() - rule.anchorStartAt.getTime());
  if (endAt.getUTCFullYear() > 9999) return null;
  return { ruleId: rule.id, date, title: snapshot.event.title, description: snapshot.event.description,
    location: snapshot.event.location, startAt, endAt, cancelled: false, updatedAt: rule.updatedAt };
}
export class EventService {
  constructor(private readonly repository: EventRepository, private readonly now = () => new Date()) {}
  async list(ownerId: string, q: EventQuery) { const rows = await this.repository.list(ownerId,q); return { items: rows.slice(0,q.limit).map(eventResponse), page: { number:q.page,limit:q.limit,hasMore:rows.length>q.limit } }; }
  async get(ownerId: string, id: string) { const snapshot=await this.repository.read(ownerId,id);return { ...eventResponse(snapshot.event), recurrence: snapshot.rules[0] ? eventRuleResponse(snapshot.rules[0]) : null }; }
  private async project(ownerId: string,id: string|null|undefined) { if(id&&!await this.repository.ownsProject(ownerId,id))throw new HttpError(404,'NOT_FOUND','Project not found'); }
  async create(ownerId: string, input: EventInput) { validTimes(input.startAt,input.endAt);await this.project(ownerId,input.projectId);return eventResponse(await this.repository.create(ownerId,input)); }
  async update(ownerId: string,id: string, patch: EventPatch) {
    await this.repository.read(ownerId,id);await this.project(ownerId,patch.projectId);
    return this.repository.mutate(ownerId,id,(snapshot)=>{
      if(snapshot.rules.length && (patch.startAt!==undefined||patch.endAt!==undefined||patch.timezone!==undefined))throw conflict('Edit series timing with PATCH recurrence anchorStartAt/anchorEndAt/timezone');
      const before=snapshot.event;
      const row={title:patch.title??before.title, description:patch.description===undefined?before.description:patch.description,
        startAt:patch.startAt??before.startAt,endAt:patch.endAt??before.endAt,timezone:patch.timezone??before.timezone,
        location:patch.location===undefined?before.location:patch.location,projectId:patch.projectId===undefined?before.projectId:patch.projectId,archivedAt:before.archivedAt,updatedAt:this.now()};
      validTimes(row.startAt,row.endAt);return {change:{event:row},result:eventResponse({...before,...row})};
    });
  }
  archive(ownerId:string,id:string,archived:boolean) { return this.repository.mutate(ownerId,id,(snapshot)=>{const row={...snapshot.event,archivedAt:archived?snapshot.event.archivedAt??this.now():null,updatedAt:this.now()};return {change:{event:row},result:eventResponse(row)};}); }
  async getRule(ownerId:string,id:string) {return eventRuleResponse(current(await this.repository.read(ownerId,id)));}
  configure(ownerId:string,id:string,input:RuleInput) {
    validateRule(input);return this.repository.mutate(ownerId,id,(snapshot)=>{editable(snapshot);if(snapshot.rules.length)throw conflict('Recurrence already configured');
      const at=this.now();const rule:EventRule={...input,id:crypto.randomUUID(),eventId:id,version:1,state:'ACTIVE',anchorStartAt:snapshot.event.startAt,anchorEndAt:snapshot.event.endAt,createdAt:at,updatedAt:at};return {change:{rule},result:eventRuleResponse(rule)};});
  }
  updateRule(ownerId:string,id:string,patch:EventRulePatch) {
    return this.repository.mutate(ownerId,id,(snapshot)=>{editable(snapshot);const previous=current(snapshot);if(previous.state==='ENDED')throw conflict('Ended recurrence cannot be edited');
      // Explicitly select rule fields so anchor fields are not passed to the strict shared DTO.
      const raw={frequency:patch.frequency??previous.frequency,interval:patch.interval??previous.interval,startDate:patch.startDate??previous.startDate,
        weekdays:patch.weekdays??previous.weekdays,endDate:patch.endDate===undefined?previous.endDate:patch.endDate,count:patch.count===undefined?previous.count:patch.count,timezone:patch.timezone??previous.timezone};
      const checked=createRuleDto.safeParse(raw);if(!checked.success)throw new HttpError(400,'VALIDATION_ERROR','Invalid recurrence');validateRule(checked.data);
      const anchorStartAt=patch.anchorStartAt??previous.anchorStartAt,anchorEndAt=patch.anchorEndAt??previous.anchorEndAt;validTimes(anchorStartAt,anchorEndAt);
      const at=this.now();const rule:EventRule={...checked.data,id:crypto.randomUUID(),eventId:id,version:previous.version+1,state:previous.state,anchorStartAt,anchorEndAt,createdAt:at,updatedAt:at};return {change:{rule},result:eventRuleResponse(rule)};});
  }
  transition(ownerId:string,id:string,action:'suspend'|'resume'|'end') {return this.repository.mutate(ownerId,id,(snapshot)=>{editable(snapshot);const rule=current(snapshot);if(rule.state==='ENDED'&&action!=='end')throw conflict('Ended recurrence cannot resume');
    const next:EventRule={...rule,state:action==='suspend'?'PAUSED':action==='resume'?'ACTIVE':'ENDED',updatedAt:this.now()};return {change:{rule:next},result:eventRuleResponse(next)};});}
  async occurrences(ownerId:string,id:string,q:EventOccurrenceQuery) {
    const snapshot=await this.repository.read(ownerId,id,q.ruleId);const rule=q.ruleId?snapshot.rules.find((r)=>r.id===q.ruleId):current(snapshot);if(!rule)throw missing();
    const exceptions=snapshot.exceptions.filter((o)=>o.ruleId===rule.id);const map=new Map(exceptions.map((o)=>[o.date,o]));
    const calculated=rule.id===snapshot.rules[0]?.id&&rule.state==='ACTIVE'&&!snapshot.event.archivedAt;
    const rows:EventException[]=[];
    if(calculated) {
      const duration=rule.anchorEndAt.getTime()-rule.anchorStartAt.getTime();
      const lower=new Date(Math.max(Date.parse('0001-01-01T00:00:00Z'),q.from.getTime()-duration-3*86400000)).toISOString().slice(0,10),upper=new Date(Math.min(Date.parse('9999-12-31T23:59:59.999Z'),q.to.getTime()+3*86400000)).toISOString().slice(0,10);
      // Inspect only nearby base dates; separately merge all moved-in exceptions.
      for(const date of schedule(rule))if(date>=lower&&date<=upper&&!map.has(date)){const row=baseOccurrence(snapshot,rule,date);if(row&&overlaps(row.startAt,row.endAt,q.from,q.to))rows.push(row);}
    }
    for(const row of exceptions)if(overlaps(row.startAt,row.endAt,q.from,q.to))rows.push(row);
    rows.sort((a,b)=>a.startAt.getTime()-b.startAt.getTime()||a.date.localeCompare(b.date));
    const offset=(q.page-1)*q.limit;return {items:rows.slice(offset,offset+q.limit).map(exceptionResponse),page:{number:q.page,limit:q.limit,hasMore:rows.length>offset+q.limit},calculated};
  }
  exception(ownerId:string,id:string,ruleId:string,date:string,patch:OccurrencePatch|null,cancelled?:boolean) {
    return this.repository.mutate(ownerId,id,(snapshot)=>{editable(snapshot);const rule=current(snapshot);
      if(!snapshot.rules.some((r)=>r.id===ruleId))throw missing();if(rule.id!==ruleId||rule.state!=='ACTIVE')throw conflict('Only current ACTIVE recurrence can change occurrences');
      if(!schedule(rule).includes(date))throw missing();const base=baseOccurrence(snapshot,rule,date);if(!base)throw missing();
      const previous=snapshot.exceptions.find((o)=>o.ruleId===ruleId&&o.date===date)??base;
      const next:EventException={...previous,title:patch?.title??previous.title,description:patch?.description===undefined?previous.description:patch.description,
        location:patch?.location===undefined?previous.location:patch.location,startAt:patch?.startAt??previous.startAt,endAt:patch?.endAt??previous.endAt,
        cancelled:cancelled??previous.cancelled,updatedAt:this.now()};validTimes(next.startAt,next.endAt);return {change:{exception:next},result:exceptionResponse(next)};});
  }
}
export interface EventDependencies {run<T>(operation:(service:EventService)=>Promise<T>):Promise<T>;}
