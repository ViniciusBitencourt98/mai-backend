import type { RequestHandler } from 'express';
import { HttpError } from '../errors/http-error';

export function cors(
  allowedOrigins: string,
  methods: readonly string[] = ['GET', 'HEAD', 'OPTIONS'],
): RequestHandler {
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
    const projects = ['/projects', '/notes'].some((path) => req.path === path || req.path.startsWith(path + '/'));
    const auth = req.path.startsWith('/auth/') || projects;
    if (auth) res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS' && req.get('Access-Control-Request-Method')) {
      res.setHeader('Access-Control-Allow-Methods', projects ? 'GET, HEAD, POST, PATCH, OPTIONS' : auth ? 'GET, HEAD, POST, OPTIONS' : methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', auth ? 'Content-Type, X-CSRF-Token' : 'Content-Type');
      res.status(204).end();
      return;
    }
    next();
  };
}
