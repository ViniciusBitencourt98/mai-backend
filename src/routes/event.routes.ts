import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { HttpError } from '../errors/http-error';
import { eventHandlers } from '../controllers/event.controller';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import type { EventDependencies } from '../services/event.service';

export function createEventRouter(auth?: AuthDependencies, events?: EventDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const controller = eventHandlers(events ?? { run: unavailable });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(requireAuthentication(resolved));
  router.get('/',controller('list'));router.get('/:id',controller('get'));router.get('/:id/recurrence',controller('getRule'));router.get('/:id/occurrences',controller('occurrences'));
  router.use(requireTrustedOrigin(resolved.settings.trustedOrigins),requireCsrfToken);
  router.post('/',controller('create'));router.patch('/:id',controller('update'));router.post('/:id/archive',controller('archive'));router.post('/:id/restore',controller('restore'));
  router.post('/:id/recurrence',controller('configure'));router.patch('/:id/recurrence',controller('updateRule'));
  for(const action of ['suspend','resume','end'] as const)router.post('/:id/recurrence/'+action,controller(action));
  router.patch('/:id/occurrences/:ruleId/:date',controller('editOccurrence'));
  router.post('/:id/occurrences/:ruleId/:date/cancel',controller('cancelOccurrence'));router.post('/:id/occurrences/:ruleId/:date/restore',controller('restoreOccurrence'));
  return router;
}
