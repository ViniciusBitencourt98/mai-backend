import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { HttpError } from '../errors/http-error';
import { taskControllers } from '../controllers/task.controller';
import { requireAuthentication, requireTrustedOrigin, requireCsrfToken } from '../middlewares/authentication';
import type { TaskDependencies } from '../services/task.service';

export function createTaskRouter(auth?: AuthDependencies, tasks?: TaskDependencies) {
  const router = Router();
  const unavailable = async (): Promise<never> => { throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service is not configured'); };
  const resolved = auth ?? { settings: authSettings({}), run: unavailable };
  const controller = taskControllers(tasks ?? { run: unavailable });
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(requireAuthentication(resolved));
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.use(requireTrustedOrigin(resolved.settings.trustedOrigins), requireCsrfToken);
  router.post('/', controller.create);
  router.patch('/:id', controller.patch);
  router.post('/:id/archive', controller.archive);
  router.post('/:id/restore', controller.restore);
  router.post('/:id/subtasks', controller.addSubtask);
  router.patch('/:id/subtasks/reorder', controller.reorderSubtasks);
  router.patch('/:id/subtasks/:subtaskId', controller.updateSubtask);
  router.delete('/:id/subtasks/:subtaskId', controller.removeSubtask);
  router.post('/:id/complete', controller.complete);
  router.post('/:id/reopen', controller.reopen);
  router.post('/:id/subtasks/:subtaskId/complete', controller.completeSubtask);
  router.post('/:id/subtasks/:subtaskId/reopen', controller.reopenSubtask);
  return router;
}
