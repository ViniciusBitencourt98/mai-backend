import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import { preferencesControllers } from '../controllers/preferences.controller';
import type { PreferencesDependencies } from '../services/preferences.service';
import { HttpError } from '../errors/http-error';
export function createPreferencesRouter(auth?: AuthDependencies, preferences?: PreferencesDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const controller = preferencesControllers(preferences ?? { run: unavailable });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(requireAuthentication(resolved));
  router.get('/', controller.get);
  router.patch('/', requireTrustedOrigin(resolved.settings.trustedOrigins), requireCsrfToken, controller.patch);
  return router;
}
