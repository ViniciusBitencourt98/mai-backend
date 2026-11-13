import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { HttpError } from '../errors/http-error';
import { decupageControllers } from '../controllers/decupage.controller';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import type { DecupageDependencies } from '../services/decupage.service';

export function createDecupageRouter(auth?: AuthDependencies, decupages?: DecupageDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const controller = decupageControllers(decupages ?? { run: unavailable });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(requireAuthentication(resolved));
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.use(requireTrustedOrigin(resolved.settings.trustedOrigins), requireCsrfToken);
  router.post('/', controller.create);
  router.patch('/:id', controller.patch);
  router.post('/:id/archive', controller.archive);
  router.post('/:id/restore', controller.restore);
  router.post('/:id/segments', controller.addSegment);
  router.patch('/:id/segments/reorder', controller.reorderSegments);
  router.patch('/:id/segments/:segmentId', controller.updateSegment);
  router.delete('/:id/segments/:segmentId', controller.removeSegment);
  return router;
}
