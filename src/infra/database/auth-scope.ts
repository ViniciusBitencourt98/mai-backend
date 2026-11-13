import { createDatabaseClient } from './client';
import { createAuthRepository } from './auth-persistence';
import { AuthService } from '../../services/auth.service';
import type { DatabaseBindings } from './config';

export function createAuthScope(bindings: DatabaseBindings) {
  return async function withAuth<T>(operation: (service: AuthService) => Promise<T>) {
    const client = createDatabaseClient(bindings.DATABASE_URL);
    try { return await operation(new AuthService(createAuthRepository(client))); }
    finally { await client.$disconnect(); }
  };
}
