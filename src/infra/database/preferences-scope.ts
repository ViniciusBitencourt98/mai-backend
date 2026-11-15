import { createDatabaseClient } from './client';
import { createPreferencesRepository } from './preferences-persistence';
import { PreferencesService } from '../../services/preferences.service';
import type { DatabaseBindings } from './config';
export function createPreferencesScope(bindings: DatabaseBindings) {
  return async function withPreferences<T>(operation: (service: PreferencesService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new PreferencesService(createPreferencesRepository(client, true))); }
    finally { await client.$disconnect(); }
  };
}
