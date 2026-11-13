import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { Router } from 'express';
import { createApp } from '../../src/app';
import { HttpError } from '../../src/errors/http-error';

// This entrypoint is exclusively for the disposable F0-06 development Worker.
// Never import it from src/index.ts. Send synthetic, non-sensitive JSON only.
const routes = Router();
routes.post('/__validation/echo', (req, res) => {
  res.status(201).json({ body: req.body, requestId: res.locals.requestId as string });
});
routes.get('/__validation/error', () => {
  throw new Error('F0-06 internal failure must not reach clients');
});
routes.get('/__validation/async-error', async () => {
  await Promise.resolve();
  throw new Error('F0-06 asynchronous internal failure');
});
routes.get('/__validation/http-error', () => {
  throw new HttpError(422, 'VALIDATION_ERROR', 'Synthetic validation error');
});

const app = createApp(env.CORS_ALLOWED_ORIGIN, {
  additionalRoutes: routes,
  corsMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
});
createServer(app).listen(3001);
export default httpServerHandler({ port: 3001 });
