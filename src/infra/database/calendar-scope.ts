import { createDatabaseClient } from './client';
import { createCalendarRepository } from './calendar-persistence';
import { createRecurrenceScope } from './recurrence-scope';
import { createEventScope } from './event-scope';
import { CalendarService } from '../../services/calendar.service';
import type { DatabaseBindings } from './config';
export function createCalendarScope(bindings:DatabaseBindings){return async function withCalendar<T>(operation:(service:CalendarService)=>Promise<T>){const client=createDatabaseClient(bindings.DATABASE_URL);try{return await operation(new CalendarService(createCalendarRepository(client),{run:createRecurrenceScope(bindings)},{run:createEventScope(bindings)}));}finally{await client.$disconnect();}};}
