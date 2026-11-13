import { createTaskRouter } from './routes/task.routes';
import { createDecupageRouter } from './routes/decupage.routes';
import { createNoteRouter } from './routes/note.routes';
import { createProjectRouter } from './routes/project.routes';
import express, { type Router } from 'express';
import { cors } from './middlewares/cors';
import { errorHandler, notFound } from './middlewares/error-handler';
import { requestId } from './middlewares/request-id';
import type { ApplicationServices } from './services/container';
import { createAuthRouter } from './routes/auth.routes';
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
  app.use(cors([allowedOrigins, ...(options.services?.auth.settings.trustedOrigins ?? [])].join(','), options.corsMethods));
  app.use(express.json({ limit: '100kb' }));
  app.use(healthRouter);
  app.use('/auth', createAuthRouter(options.services?.auth));
  app.use('/projects', createProjectRouter(options.services?.auth, options.services?.projects));
  app.use('/notes', createNoteRouter(options.services?.auth, options.services?.notes));
  app.use('/decupages', createDecupageRouter(options.services?.auth, options.services?.decupages));
  app.use('/tasks', createTaskRouter(options.services?.auth, options.services?.tasks));
  if (options.additionalRoutes) app.use(options.additionalRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
