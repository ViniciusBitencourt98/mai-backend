import type { RequestHandler } from 'express';
import { parse } from './input';
import { authentication } from '../middlewares/authentication';
import { dashboardQueryDto } from '../dashboard/dto';
import type { DashboardDependencies } from '../services/dashboard.service';
export function dashboardController(dependencies: DashboardDependencies): RequestHandler {
  return async (req, res) => {
    const query = parse(dashboardQueryDto, req.query), session = authentication(res);
    res.json(await dependencies.run((service) => service.get(session.user.id, query, session.user.preferences.timezone)));
  };
}
