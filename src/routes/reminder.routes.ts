import {Router} from 'express';
import {z} from 'zod';
import {sourceTypeDto} from '../notifications/dto';
import {parse,json} from '../controllers/input';
import {reminderSettingsDto,type ReminderDependencies} from '../services/reminder.service';
import type {AuthDependencies} from '../auth/dependencies';
import {authSettings} from '../auth/settings';
import {authentication,requireAuthentication,requireTrustedOrigin,requireCsrfToken} from '../middlewares/authentication';
import {HttpError} from '../errors/http-error';
export function createReminderRouter(auth?:AuthDependencies,dependencies?:ReminderDependencies){
 const unavailable=async():Promise<never>=>{throw new HttpError(503,'SERVICE_UNAVAILABLE','Service is not configured');};
 const resolved=auth??{settings:authSettings({}),run:unavailable};const service=dependencies??{get:unavailable,set:unavailable};const router=Router();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});router.use(requireAuthentication(resolved));
 const ref=(params:unknown)=>parse(z.object({sourceType:sourceTypeDto,sourceId:z.uuid()}).strict(),params);
 router.get('/:sourceType/:sourceId',async(req,res)=>{parse(z.object({}).strict(),req.query);res.json({rule:await service.get(authentication(res).user.id,ref(req.params))});});
 router.put('/:sourceType/:sourceId',requireTrustedOrigin(resolved.settings.trustedOrigins),requireCsrfToken,async(req,res)=>{parse(z.object({}).strict(),req.query);const source=ref(req.params),input=parse(reminderSettingsDto,json(req));res.json({rule:await service.set(authentication(res).user.id,source,input)});});return router;
}
