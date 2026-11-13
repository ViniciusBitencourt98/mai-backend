import type { RequestHandler, Response } from 'express';
import type { AuthContext } from '../auth/dto';
import type { AuthDependencies } from '../auth/dependencies';
import { sessionCookie } from '../auth/cookies';
import { HttpError } from '../errors/http-error';
import { safeEqual } from '../auth/crypto';

export function authentication(res: Response): AuthContext {
  const session = res.locals.auth as AuthContext | undefined;
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
  return session;
}

export function requireAuthentication(dependencies: AuthDependencies): RequestHandler {
  return async (req, res, next) => {
    const token = sessionCookie(req.get('Cookie'), dependencies.settings.cookieName);
    if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
    res.locals.auth = await dependencies.run((service) => service.authenticate(token));
    next();
  };
}

/** Apply to every cookie-authenticated state-changing endpoint, not just logout. */
export function requireTrustedOrigin(origins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (!origins.includes(req.get('Origin') ?? '')) throw new HttpError(403, 'CSRF_ORIGIN_DENIED', 'Request origin is not allowed');
    next();
  };
}
export const requireCsrfToken: RequestHandler = (req, res, next) => {
  const supplied = req.get('X-CSRF-Token') ?? '';
  if (!safeEqual(supplied, authentication(res).csrfToken)) throw new HttpError(403, 'CSRF_TOKEN_INVALID', 'Invalid CSRF token');
  next();
};
