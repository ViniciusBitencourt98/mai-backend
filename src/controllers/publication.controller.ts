import { parse, json } from './input';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { authentication } from '../middlewares/authentication';
import { createPublicationDto, patchPublicationDto, publicationIdDto, publicationQueryDto, publicationResponse } from '../publications/dto';
import type { PublicationDependencies } from '../services/publication.service';

export function publicationControllers(dependencies: PublicationDependencies) {
  const list: RequestHandler = async (req, res) => {
    const query = parse(publicationQueryDto, req.query);
    const result = await dependencies.run((service) => service.list(authentication(res).user.id, query));
    res.json({ ...result, items: result.items.map(publicationResponse) });
  };
  const get: RequestHandler = async (req, res) => {
    const id = parse(publicationIdDto, req.params.id);
    res.json(publicationResponse(await dependencies.run((service) => service.get(authentication(res).user.id, id))));
  };
  const create: RequestHandler = async (req, res) => {
    const input = parse(createPublicationDto, json(req));
    const result = await dependencies.run((service) => service.create(authentication(res).user.id, input));
    res.location('/publications/' + result.id).status(201).json(publicationResponse(result));
  };
  const patch: RequestHandler = async (req, res) => {
    const id = parse(publicationIdDto, req.params.id);
    const input = parse(patchPublicationDto, json(req));
    res.json(publicationResponse(await dependencies.run((service) => service.update(authentication(res).user.id, id, input))));
  };
  const transition = (archived: boolean): RequestHandler => async (req, res) => {
    const id = parse(publicationIdDto, req.params.id);
    if (req.body !== undefined) parse(z.object({}).strict(), req.body);
    const result = await dependencies.run((service) => archived ? service.archive(authentication(res).user.id, id) : service.restore(authentication(res).user.id, id));
    res.json(publicationResponse(result));
  };
  return { list, get, create, patch, archive: transition(true), restore: transition(false) };
}
