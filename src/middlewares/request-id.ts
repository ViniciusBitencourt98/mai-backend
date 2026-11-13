import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestId: RequestHandler = (_req, res, next) => {
  // Generate locally instead of trusting arbitrary client-supplied identifiers.
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId as string);
  next();
};
