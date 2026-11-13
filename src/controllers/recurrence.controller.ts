import { z } from 'zod';
import type { RequestHandler } from 'express';
import type { RecurrenceDependencies } from '../services/recurrence.service';
import { authentication } from '../middlewares/authentication';
import { parse, json } from './input';
import { createRuleDto, patchRuleDto, occurrenceQueryDto, dateDto } from '../recurrence/dto';
export function recurrenceHandlers(dependencies: RecurrenceDependencies) {
  const handle = (action: 'get' | 'configure' | 'update' | 'suspend' | 'resume' | 'end' | 'occurrences' | 'complete' | 'reopen'): RequestHandler => async (req, res) => {
    const taskId = parse(z.uuid(), req.params.id); const ownerId = authentication(res).user.id;
    const result = await dependencies.run<unknown>(async (service) => {
      if (action === 'get') return service.get(ownerId, taskId);
      if (action === 'configure') return service.configure(ownerId, taskId, parse(createRuleDto, json(req)));
      if (action === 'update') return service.update(ownerId, taskId, parse(patchRuleDto, json(req)));
      if (action === 'occurrences') return service.occurrences(ownerId, taskId, parse(occurrenceQueryDto, req.query));
      if (req.body !== undefined) parse(z.object({}).strict(), req.body);
      if (action === 'complete' || action === 'reopen') return service.setCompleted(ownerId, taskId, parse(z.uuid(), req.params.ruleId), parse(dateDto, req.params.date), action === 'complete');
      return service.transition(ownerId, taskId, action);
    });
    res.status(action === 'configure' ? 201 : 200).json(result);
  };
  return handle;
}
