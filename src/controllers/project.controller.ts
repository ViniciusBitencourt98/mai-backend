import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { HttpError } from '../errors/http-error';
import { authentication } from '../middlewares/authentication';
import { createProjectDto, patchProjectDto, projectIdDto, projectQueryDto, projectResponse } from '../projects/dto';
import type { ProjectDependencies } from '../services/project.service';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid project input');
  return result.data;
}
function json(req: Request) {
  if (!req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
  return req.body as unknown;
}
export function projectControllers(dependencies: ProjectDependencies) {
  const list: RequestHandler = async (req, res) => {
    const query = parse(projectQueryDto, req.query);
    const result = await dependencies.run((service) => service.list(authentication(res).user.id, query));
    res.json({ ...result, items: result.items.map(projectResponse) });
  };
  const get: RequestHandler = async (req, res) => {
    const id = parse(projectIdDto, req.params.id);
    res.json(projectResponse(await dependencies.run((service) => service.get(authentication(res).user.id, id))));
  };
  const create: RequestHandler = async (req, res) => {
    const input = parse(createProjectDto, json(req));
    const result = await dependencies.run((service) => service.create(authentication(res).user.id, input));
    res.location('/projects/' + result.id).status(201).json(projectResponse(result));
  };
  const patch: RequestHandler = async (req, res) => {
    const id = parse(projectIdDto, req.params.id);
    const input = parse(patchProjectDto, json(req));
    res.json(projectResponse(await dependencies.run((service) => service.update(authentication(res).user.id, id, input))));
  };
  const transition = (archived: boolean): RequestHandler => async (req, res) => {
    const id = parse(projectIdDto, req.params.id);
    if (req.body !== undefined && (typeof req.body !== 'object' || req.body === null || Object.keys(req.body).length > 0))
      throw new HttpError(400, 'VALIDATION_ERROR', 'This operation accepts no fields');
    const result = await dependencies.run((service) => archived ? service.archive(authentication(res).user.id, id) : service.restore(authentication(res).user.id, id));
    res.json(projectResponse(result));
  };
  return { list, get, create, patch, archive: transition(true), restore: transition(false) };
}
