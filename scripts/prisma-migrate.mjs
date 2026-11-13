import process from 'node:process';
import console from 'node:console';
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { requireDevelopmentDatabase } from './development-database.mjs';

try {
  requireDevelopmentDatabase(process.env);
  const command = process.argv[2];
  if (!['dev', 'deploy', 'status'].includes(command)) throw new Error('Unsupported development migration command');
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve('prisma'), 'migrate', command, ...process.argv.slice(3)], {
    stdio: 'inherit', env: process.env,
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  // Configuration errors are deliberately safe and contain no connection URL.
  console.error(error instanceof Error ? error.message : 'Development database configuration required');
  process.exitCode = 1;
}
