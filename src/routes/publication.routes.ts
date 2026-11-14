import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { HttpError } from '../errors/http-error';
import { publicationControllers } from '../controllers/publication.controller';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import type { PublicationDependencies } from '../services/publication.service';

export function createPublicationRouter(auth?: AuthDependencies, publications?: PublicationDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const controller = publicationControllers(publications ?? { run: unavailable });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(requireAuthentication(resolved));
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.use(requireTrustedOrigin(resolved.settings.trustedOrigins), requireCsrfToken);
  router.post('/', controller.create);
  router.patch('/:id', controller.patch);
  router.post('/:id/archive', controller.archive);
  router.post('/:id/restore', controller.restore);
  return router;
}
