import type { PatchPreferences } from '../preferences/dto';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import { HttpError } from '../errors/http-error';
const denied = () => new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
export class PreferencesService {
  constructor(private readonly repository: PreferencesRepository) {}
  async get(userId: string) {
    const result = await this.repository.get(userId);
    if (!result) throw denied();
    return result;
  }
  async update(userId: string, input: PatchPreferences) {
    const patch: PatchPreferences = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
      ...(input.dailyDigestEnabled !== undefined ? { dailyDigestEnabled: input.dailyDigestEnabled } : {}),
      ...(input.dailyDigestTime !== undefined ? { dailyDigestTime: input.dailyDigestTime } : {}),
    };
    const result = await this.repository.update(userId, patch);
    if (!result) throw denied();
    return result;
  }
}
export interface PreferencesDependencies { run<T>(operation: (service: PreferencesService) => Promise<T>): Promise<T>; }
