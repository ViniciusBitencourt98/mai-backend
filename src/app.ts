import express from 'express';
import { cors } from './middlewares/cors';
import { errorHandler, notFound } from './middlewares/error-handler';
import { requestId } from './middlewares/request-id';
import { healthRouter } from './routes/health.routes';

export function createApp(allowedOrigins = '') {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(cors(allowedOrigins));
  app.use(express.json({ limit: '100kb' }));
  app.use(healthRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
