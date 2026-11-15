import type { RequestHandler } from 'express';
import { parse, json } from './input';
import { authentication } from '../middlewares/authentication';
import { patchPreferencesDto, preferencesQueryDto } from '../preferences/dto';
import type { PreferencesDependencies } from '../services/preferences.service';
export function preferencesControllers(dependencies: PreferencesDependencies) {
  const get: RequestHandler = async (req, res) => {
    parse(preferencesQueryDto, req.query);
    res.json(await dependencies.run((s) => s.get(authentication(res).user.id)));
  };
  const patch: RequestHandler = async (req, res) => {
    parse(preferencesQueryDto, req.query);
    const input = parse(patchPreferencesDto, json(req));
    res.json(await dependencies.run((s) => s.update(authentication(res).user.id, input)));
  };
  return { get, patch };
}
