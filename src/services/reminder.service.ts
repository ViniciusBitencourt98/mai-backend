import { z } from 'zod';
import type { SourceRef } from '../notifications/dto';
export const reminderSettingsDto=z.object({leadMinutes:z.number().int().min(0).max(43200),enabled:z.boolean()}).strict();
export interface ReminderSettings {leadMinutes:number;enabled:boolean;}
export interface ReminderDependencies {get(owner:string,ref:SourceRef):Promise<unknown>;set(owner:string,ref:SourceRef,input:ReminderSettings):Promise<unknown>;}
