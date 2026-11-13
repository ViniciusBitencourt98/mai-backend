import 'dotenv/config';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { requireDevelopmentDatabase } from './development-database.mjs';
import { firstUserSql } from '../src/auth/bootstrap';

try {
  requireDevelopmentDatabase(process.env);
  if (process.stdin.isTTY) throw new Error('Use a password manager to pipe a JSON object via stdin; never pass passwords in command arguments');
  let body = '';
  for await (const chunk of process.stdin) {
    body += String(chunk);
    if (Buffer.byteLength(body) > 16_384) throw new Error('Input limit exceeded');
  }
  const sql = await firstUserSql(JSON.parse(body));
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve('prisma'), 'db', 'execute', '--stdin'], {
    input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: process.env,
  });
  // Suppress SQL and underlying error output, which may contain credential material.
  if (result.status !== 0) throw new Error('Bootstrap failed; verify development settings, migrations, and whether a user already exists');
  console.log('Initial development user created');
} catch {
  console.error('Initial user was not created. Check development configuration, input schema, migrations, and existing users. No credentials were printed.');
  process.exitCode = 1;
}
