import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaClient } from '../../generated/prisma/client';
import { validateDatabaseUrl } from './config';

/** Call within a request/operation; never keep sockets across Worker requests. */
export function createDatabaseClient(databaseUrl: string | undefined) {
  const connectionString = validateDatabaseUrl(databaseUrl);
  // Workers and supported Node releases provide the native WebSocket implementation.
  neonConfig.webSocketConstructor = WebSocket;
  const adapter = new PrismaNeon({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  return new PrismaClient({ adapter, log: [] });
}
