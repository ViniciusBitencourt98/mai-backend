import type { RequestHandler } from 'express';
import { HttpError } from '../errors/http-error';

export function cors(allowedOrigins: string): RequestHandler {
  const origins = new Set(allowedOrigins.split(',').map((origin) => origin.trim()).filter(Boolean));
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error('CORS_ALLOWED_ORIGIN must contain exact HTTP(S) origins');
    }
  }

  return (req, res, next) => {
    res.vary('Origin');
    const origin = req.get('Origin');
    if (!origin) {
      next();
      return;
    }
    if (!origins.has(origin)) {
      next(new HttpError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS' && req.get('Access-Control-Request-Method')) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).end();
      return;
    }
    next();
  };
}
