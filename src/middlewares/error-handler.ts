import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../errors/http-error';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const isBodyError = (type: string) =>
    typeof error === 'object' && error !== null && 'type' in error && error.type === type;
  const httpError = error instanceof HttpError ? error
    : isBodyError('entity.parse.failed') ? new HttpError(400, 'INVALID_JSON', 'Invalid JSON body')
    : isBodyError('entity.too.large') ? new HttpError(413, 'PAYLOAD_TOO_LARGE', 'JSON body exceeds limit')
    : new HttpError(500, 'INTERNAL_ERROR', 'Internal server error');

  if (httpError.code === 'LOGIN_RATE_LIMITED') res.setHeader('Retry-After', '900');
  res.status(httpError.status).json({
    error: { code: httpError.code, message: httpError.message, details: [] },
    requestId: res.locals.requestId as string,
  });
};
