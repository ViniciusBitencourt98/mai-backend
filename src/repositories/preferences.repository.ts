import type { PatchPreferences, PreferencesRecord } from '../preferences/dto';
export interface PreferencesRepository {
  get(userId: string): Promise<PreferencesRecord | null>;
  update(userId: string, patch: PatchPreferences): Promise<PreferencesRecord | null>;
}
