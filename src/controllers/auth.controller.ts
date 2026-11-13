import type { RequestHandler } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { loginDto, sessionResponse } from '../auth/dto';
import { cookieOptions, sessionCookie } from '../auth/cookies';
import { HttpError } from '../errors/http-error';
import { authentication } from '../middlewares/authentication';
import { SESSION_TTL_MS } from '../services/auth.service';

export function authControllers(dependencies: AuthDependencies) {
  const { settings } = dependencies;
  const login: RequestHandler = async (req, res) => {
    if (!req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
    const input = loginDto.safeParse(req.body);
    if (!input.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid login input');
    const previous = sessionCookie(req.get('Cookie'), settings.cookieName);
    const address = dependencies.clientAddress?.(req) ?? req.ip ?? 'unknown';
    const result = await dependencies.run((service) => service.login(input.data.email, input.data.password, address, previous));
    res.cookie(settings.cookieName, result.token, { ...cookieOptions(settings), maxAge: SESSION_TTL_MS });
    res.status(200).json(sessionResponse(result.session));
  };
  const me: RequestHandler = (_req, res) => res.status(200).json(sessionResponse(authentication(res)));
  const logout: RequestHandler = async (_req, res) => {
    await dependencies.run((service) => service.logout(authentication(res)));
    res.clearCookie(settings.cookieName, cookieOptions(settings));
    res.status(204).end();
  };
  return { login, me, logout };
}
