import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { requireAuthentication } from '../middlewares/authentication';
import { dashboardController } from '../controllers/dashboard.controller';
import type { DashboardDependencies } from '../services/dashboard.service';
import { HttpError } from '../errors/http-error';
export function createDashboardRouter(auth?: AuthDependencies, dashboard?: DashboardDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', requireAuthentication(resolved), dashboardController(dashboard ?? { run: unavailable }));
  return router;
}
