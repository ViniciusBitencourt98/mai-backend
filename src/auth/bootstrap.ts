import { randomUUID } from 'node:crypto';
import { bootstrapUserDto } from './dto';
import { hashPassword } from './crypto';

/** Operator-only SQL preparation. There is deliberately no public registration API. */
export async function firstUserSql(input: unknown): Promise<string> {
  const user = bootstrapUserDto.parse(input);
  const passwordHash = await hashPassword(user.password);
  const id = randomUUID();
  const literal = (value: string) => `convert_from(decode('${Buffer.from(value, 'utf8').toString('base64')}', 'base64'), 'UTF8')`;
  return `BEGIN;
SELECT pg_advisory_xact_lock(6842190);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users") THEN
    RAISE EXCEPTION 'First user already exists';
  END IF;
END; $$;
INSERT INTO "users" ("id", "email", "name", "password_hash", "updated_at")
VALUES (${literal(id)}::uuid, ${literal(user.email)}, ${literal(user.name)}, ${literal(passwordHash)}, CURRENT_TIMESTAMP);
INSERT INTO "user_preferences" ("user_id") VALUES (${literal(id)}::uuid);
COMMIT;`;
}
