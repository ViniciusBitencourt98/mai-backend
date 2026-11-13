import type { RequestHandler } from 'express';
import { z } from 'zod';
import { parse, json } from './input';
import { authentication } from '../middlewares/authentication';
import type { EventDependencies } from '../services/event.service';
import { createEventDto,patchEventDto,eventQueryDto,createEventRuleDto,patchEventRuleDto,eventOccurrenceQueryDto,occurrencePatchDto,dateDto } from '../events/dto';
export function eventHandlers(dependencies:EventDependencies){
 return (action:'list'|'get'|'create'|'update'|'archive'|'restore'|'getRule'|'configure'|'updateRule'|'suspend'|'resume'|'end'|'occurrences'|'editOccurrence'|'cancelOccurrence'|'restoreOccurrence'):RequestHandler=>async(req,res)=>{
  const ownerId=authentication(res).user.id;const id=action==='list'||action==='create'?'':parse(z.uuid(),req.params.id);
  const result=await dependencies.run<unknown>(async(service)=>{
    if(action==='list')return service.list(ownerId,parse(eventQueryDto,req.query));
    if(action==='get')return service.get(ownerId,id);
    if(action==='create')return service.create(ownerId,parse(createEventDto,json(req)));
    if(action==='update')return service.update(ownerId,id,parse(patchEventDto,json(req)));
    if(action==='getRule')return service.getRule(ownerId,id);
    if(action==='configure')return service.configure(ownerId,id,parse(createEventRuleDto,json(req)));
    if(action==='updateRule')return service.updateRule(ownerId,id,parse(patchEventRuleDto,json(req)));
    if(action==='occurrences')return service.occurrences(ownerId,id,parse(eventOccurrenceQueryDto,req.query));
    if(action==='editOccurrence')return service.exception(ownerId,id,parse(z.uuid(),req.params.ruleId),parse(dateDto,req.params.date),parse(occurrencePatchDto,json(req)));
    if(req.body!==undefined)parse(z.object({}).strict(),req.body);
    if(action==='cancelOccurrence'||action==='restoreOccurrence')return service.exception(ownerId,id,parse(z.uuid(),req.params.ruleId),parse(dateDto,req.params.date),null,action==='cancelOccurrence');
    if(action==='archive'||action==='restore')return service.archive(ownerId,id,action==='archive');
    return service.transition(ownerId,id,action);
  });
  if(action==='create')res.location('/events/'+(result as {id:string}).id);
  res.status(action==='create'||action==='configure'?201:200).json(result);
 };
}
