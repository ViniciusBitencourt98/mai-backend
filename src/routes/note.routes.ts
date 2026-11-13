import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { HttpError } from '../errors/http-error';
import { noteControllers } from '../controllers/note.controller';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import type { NoteDependencies } from '../services/note.service';

export function createNoteRouter(auth?: AuthDependencies, notes?: NoteDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const controller = noteControllers(notes ?? { run: unavailable });
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
