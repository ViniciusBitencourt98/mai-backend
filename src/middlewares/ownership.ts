import type { Request, RequestHandler } from 'express';
import type { AuthContext } from '../auth/dto';
import { HttpError } from '../errors/http-error';
import { authentication } from './authentication';

export function assertOwner(session: AuthContext | undefined, ownerId: string): void {
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
  if (session.user.id !== ownerId) throw new HttpError(403, 'FORBIDDEN', 'Access denied');
}

/** Future repositories must ALSO scope queries/mutations by session.user.id. */
export function requireOwnership(loadOwner: (request: Request, session: AuthContext) => Promise<string | null>): RequestHandler {
  return async (req, res, next) => {
    const session = authentication(res);
    const ownerId = await loadOwner(req, session);
    if (ownerId === null) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    assertOwner(session, ownerId);
    next();
  };
}
