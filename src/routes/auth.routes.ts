import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { authControllers } from '../controllers/auth.controller';
import { requireAuthentication, requireCsrfToken, requireTrustedOrigin } from '../middlewares/authentication';
import { HttpError } from '../errors/http-error';

export function createAuthRouter(dependencies?: AuthDependencies) {
  const resolved: AuthDependencies = dependencies ?? {
    settings: authSettings({}),
    run: async () => { throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Authentication is not configured'); },
  };
  const router = Router();
  const controller = authControllers(resolved);
  const trustedOrigin = requireTrustedOrigin(resolved.settings.trustedOrigins);
  const authenticated = requireAuthentication(resolved);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.post('/login', trustedOrigin, controller.login);
  router.get('/me', authenticated, controller.me);
  router.post('/logout', trustedOrigin, authenticated, requireCsrfToken, controller.logout);
  return router;
}
