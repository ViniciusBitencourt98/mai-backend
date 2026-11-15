import { z } from 'zod';
import { timezoneDto } from '../recurrence/dto';
export const preferenceDefaults = { timezone: 'America/Bahia', emailEnabled: false, dailyDigestEnabled: false, dailyDigestTime: '08:00' } as const;
export const patchPreferencesDto = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: timezoneDto.optional(),
  emailEnabled: z.boolean().optional(),
  dailyDigestEnabled: z.boolean().optional(),
  dailyDigestTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
export const preferencesQueryDto = z.object({}).strict();
export type PatchPreferences = z.infer<typeof patchPreferencesDto>;
export interface PreferencesRecord { name: string; timezone: string; emailEnabled: boolean; dailyDigestEnabled: boolean; dailyDigestTime: string; }
