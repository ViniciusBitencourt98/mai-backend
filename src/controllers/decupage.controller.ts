import { createSegmentDto, patchSegmentDto, reorderSegmentsDto, segmentResponse } from '../decupages/dto';
import { parse, json } from './input';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { authentication } from '../middlewares/authentication';
import { createDecupageDto, patchDecupageDto, decupageIdDto, decupageQueryDto, decupageResponse } from '../decupages/dto';
import type { DecupageDependencies } from '../services/decupage.service';

export function decupageControllers(dependencies: DecupageDependencies) {
  const list: RequestHandler = async (req, res) => {
    const query = parse(decupageQueryDto, req.query);
    const result = await dependencies.run((service) => service.list(authentication(res).user.id, query));
    res.json({ ...result, items: result.items.map(decupageResponse) });
  };
  const get: RequestHandler = async (req, res) => {
    const id = parse(decupageIdDto, req.params.id);
    res.json(decupageResponse(await dependencies.run((service) => service.get(authentication(res).user.id, id))));
  };
  const create: RequestHandler = async (req, res) => {
    const input = parse(createDecupageDto, json(req));
    const result = await dependencies.run((service) => service.create(authentication(res).user.id, input));
    res.location('/decupages/' + result.id).status(201).json(decupageResponse(result));
  };
  const patch: RequestHandler = async (req, res) => {
    const id = parse(decupageIdDto, req.params.id);
    const input = parse(patchDecupageDto, json(req));
    res.json(decupageResponse(await dependencies.run((service) => service.update(authentication(res).user.id, id, input))));
  };
  const transition = (archived: boolean): RequestHandler => async (req, res) => {
    const id = parse(decupageIdDto, req.params.id);
    if (req.body !== undefined) parse(z.object({}).strict(), req.body);
    const result = await dependencies.run((service) => archived ? service.archive(authentication(res).user.id, id) : service.restore(authentication(res).user.id, id));
    res.json(decupageResponse(result));
  };
  const segments = (action: 'add' | 'update' | 'remove' | 'reorder'): RequestHandler => async (req, res) => {
    const id = parse(decupageIdDto, req.params.id);
    const ownerId = authentication(res).user.id;
    const segmentId = action === 'update' || action === 'remove' ? parse(decupageIdDto, req.params.segmentId) : '';
    const result = await dependencies.run((service) => {
      if (action === 'add') return service.addSegment(ownerId, id, parse(createSegmentDto, json(req)));
      if (action === 'update') return service.updateSegment(ownerId, id, segmentId, parse(patchSegmentDto, json(req)));
      if (action === 'remove') return service.removeSegment(ownerId, id, segmentId);
      return service.reorderSegments(ownerId, id, parse(reorderSegmentsDto, json(req)).segmentIds);
    });
    res.status(action === 'add' ? 201 : 200).json({ items: result.map(segmentResponse) });
  };
  return { list, get, create, patch, archive: transition(true), restore: transition(false),
    addSegment: segments('add'), updateSegment: segments('update'), removeSegment: segments('remove'), reorderSegments: segments('reorder') };

}
