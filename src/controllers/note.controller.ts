import { parse, json } from './input';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { authentication } from '../middlewares/authentication';
import { createNoteDto, patchNoteDto, noteIdDto, noteQueryDto, noteResponse } from '../notes/dto';
import type { NoteDependencies } from '../services/note.service';

export function noteControllers(dependencies: NoteDependencies) {
  const list: RequestHandler = async (req, res) => {
    const query = parse(noteQueryDto, req.query);
    const result = await dependencies.run((service) => service.list(authentication(res).user.id, query));
    res.json({ ...result, items: result.items.map(noteResponse) });
  };
  const get: RequestHandler = async (req, res) => {
    const id = parse(noteIdDto, req.params.id);
    res.json(noteResponse(await dependencies.run((service) => service.get(authentication(res).user.id, id))));
  };
  const create: RequestHandler = async (req, res) => {
    const input = parse(createNoteDto, json(req));
    const result = await dependencies.run((service) => service.create(authentication(res).user.id, input));
    res.location('/notes/' + result.id).status(201).json(noteResponse(result));
  };
  const patch: RequestHandler = async (req, res) => {
    const id = parse(noteIdDto, req.params.id);
    const input = parse(patchNoteDto, json(req));
    res.json(noteResponse(await dependencies.run((service) => service.update(authentication(res).user.id, id, input))));
  };
  const transition = (archived: boolean): RequestHandler => async (req, res) => {
    const id = parse(noteIdDto, req.params.id);
    if (req.body !== undefined) parse(z.object({}).strict(), req.body);
    const result = await dependencies.run((service) => archived ? service.archive(authentication(res).user.id, id) : service.restore(authentication(res).user.id, id));
    res.json(noteResponse(result));
  };
  return { list, get, create, patch, archive: transition(true), restore: transition(false) };
}
