import { Router } from 'express';
import type { AuthDependencies } from '../auth/dependencies';
import type { CalendarDependencies } from '../services/calendar.service';
import { authSettings } from '../auth/settings';
import { authentication,requireAuthentication } from '../middlewares/authentication';
import { HttpError } from '../errors/http-error';
import { parse } from '../controllers/input';
import { calendarQueryDto } from '../calendar/dto';
export function createCalendarRouter(auth?:AuthDependencies,calendar?:CalendarDependencies){const router=Router();const unavailable=async():Promise<never>=>{throw new HttpError(503,'SERVICE_UNAVAILABLE','Service not configured');};const resolved=auth??{settings:authSettings({}),run:unavailable};router.get('/',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},requireAuthentication(resolved),async(req,res)=>{const q=parse(calendarQueryDto,req.query),session=authentication(res);res.json(await(calendar??{run:unavailable}).run((s)=>s.list(session.user.id,q,session.user.preferences.timezone)));});return router;}
