import express, { type Router } from 'express';
import { cors } from './middlewares/cors';
import { errorHandler, notFound } from './middlewares/error-handler';
import { requestId } from './middlewares/request-id';
import type { ApplicationServices } from './services/container';
import { healthRouter } from './routes/health.routes';

interface AppOptions {
  services?: ApplicationServices;
  additionalRoutes?: Router;
  corsMethods?: readonly string[];
}

export function createApp(allowedOrigins = '', options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.services = options.services;
  app.use(requestId);
  app.use(cors(allowedOrigins, options.corsMethods));
  app.use(express.json({ limit: '100kb' }));
  app.use(healthRouter);
  if (options.additionalRoutes) app.use(options.additionalRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
