import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../controllers/input';
import { historyQueryDto, type NotificationHistory } from '../notifications/history';
import type { AuthDependencies } from '../auth/dependencies';
import { authSettings } from '../auth/settings';
import { authentication, requireAuthentication } from '../middlewares/authentication';
import { HttpError } from '../errors/http-error';
export function createNotificationRouter(auth?:AuthDependencies,history?:NotificationHistory) {
  const unavailable=async():Promise<never>=>{throw new HttpError(503,'SERVICE_UNAVAILABLE','Service is not configured');};
  const router=Router(), service=history??{list:unavailable,get:unavailable};
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.use(requireAuthentication(auth??{settings:authSettings({}),run:unavailable}));
  router.get('/',async(req,res)=>{res.json(await service.list(authentication(res).user.id,parse(historyQueryDto,req.query)));});
  router.get('/:id',async(req,res)=>{parse(z.object({}).strict(),req.query);res.json(await service.get(authentication(res).user.id,parse(z.uuid(),req.params.id)));});
  return router;
}
