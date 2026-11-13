import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import type { RecurrenceDependencies } from '../services/recurrence.service';
import { authSettings } from '../auth/settings';
import { HttpError } from '../errors/http-error';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import { recurrenceHandlers } from '../controllers/recurrence.controller';
export function createRecurrenceRouter(auth?: AuthDependencies, recurrence?: RecurrenceDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const dependencies = recurrence ?? { run: unavailable };
  // Mounted at /tasks; only claim recurrence/occurrence paths.
  const scoped = Router({ mergeParams: true });
  scoped.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  scoped.use(requireAuthentication(resolved));
  const handle = recurrenceHandlers(dependencies);
  scoped.get('/recurrence', handle('get'));
  scoped.get('/occurrences', handle('occurrences'));
  scoped.use(requireTrustedOrigin(resolved.settings.trustedOrigins), requireCsrfToken);
  scoped.post('/recurrence', handle('configure')); scoped.patch('/recurrence', handle('update'));
  for (const action of ['suspend', 'resume', 'end'] as const) scoped.post('/recurrence/' + action, handle(action));
  for (const action of ['complete', 'reopen'] as const) scoped.post('/occurrences/:ruleId/:date/' + action, handle(action));
  router.use('/:id', (req, res, next) => {
    if (req.path === '/recurrence' || req.path.startsWith('/recurrence/') || req.path === '/occurrences' || req.path.startsWith('/occurrences/')) scoped(req, res, next);
    else next();
  });
  return router;
}
