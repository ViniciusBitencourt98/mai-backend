import { createSubtaskDto, patchSubtaskDto, reorderSubtasksDto, subtaskResponse } from '../tasks/dto';
import { parse, json } from './input';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { authentication } from '../middlewares/authentication';
import { createTaskDto, patchTaskDto, taskIdDto, taskQueryDto, taskResponse } from '../tasks/dto';
import type { TaskDependencies } from '../services/task.service';

export function taskControllers(dependencies: TaskDependencies) {
  const list: RequestHandler = async (req, res) => {
    const query = parse(taskQueryDto, req.query);
    const result = await dependencies.run((service) => service.list(authentication(res).user.id, query, authentication(res).user.preferences.timezone));
    res.json({ ...result, items: result.items.map(taskResponse) });
  };
  const get: RequestHandler = async (req, res) => {
    const id = parse(taskIdDto, req.params.id);
    res.json(taskResponse(await dependencies.run((service) => service.get(authentication(res).user.id, id))));
  };
  const create: RequestHandler = async (req, res) => {
    const input = parse(createTaskDto, json(req));
    const result = await dependencies.run((service) => service.create(authentication(res).user.id, input));
    res.location('/tasks/' + result.id).status(201).json(taskResponse(result));
  };
  const patch: RequestHandler = async (req, res) => {
    const id = parse(taskIdDto, req.params.id);
    const input = parse(patchTaskDto, json(req));
    res.json(taskResponse(await dependencies.run((service) => service.update(authentication(res).user.id, id, input))));
  };
  const transition = (action: 'archive' | 'restore' | 'complete' | 'reopen'): RequestHandler => async (req, res) => {
    const id = parse(taskIdDto, req.params.id);
    if (req.body !== undefined) parse(z.object({}).strict(), req.body);
    const result = await dependencies.run((service) => service[action](authentication(res).user.id, id));
    res.json(taskResponse(result));
  };
  const subtasks = (action: 'add' | 'update' | 'remove' | 'reorder' | 'complete' | 'reopen'): RequestHandler => async (req, res) => {
    const id = parse(taskIdDto, req.params.id);
    const ownerId = authentication(res).user.id;
    const subtaskId = ['update', 'remove', 'complete', 'reopen'].includes(action) ? parse(taskIdDto, req.params.subtaskId) : '';
    const result = await dependencies.run((service) => {
      if (action === 'complete' || action === 'reopen') {
        if (req.body !== undefined) parse(z.object({}).strict(), req.body);
        return service.updateSubtask(ownerId, id, subtaskId, { completed: action === 'complete' });
      }
      if (action === 'add') return service.addSubtask(ownerId, id, parse(createSubtaskDto, json(req)));
      if (action === 'update') return service.updateSubtask(ownerId, id, subtaskId, parse(patchSubtaskDto, json(req)));
      if (action === 'remove') return service.removeSubtask(ownerId, id, subtaskId);
      return service.reorderSubtasks(ownerId, id, parse(reorderSubtasksDto, json(req)).subtaskIds);
    });
    res.status(action === 'add' ? 201 : 200).json({ items: result.map(subtaskResponse) });
  };
  return { list, get, create, patch, archive: transition('archive'), restore: transition('restore'), complete: transition('complete'), reopen: transition('reopen'),
    addSubtask: subtasks('add'), updateSubtask: subtasks('update'), removeSubtask: subtasks('remove'), reorderSubtasks: subtasks('reorder'), completeSubtask: subtasks('complete'), reopenSubtask: subtasks('reopen') };

}
