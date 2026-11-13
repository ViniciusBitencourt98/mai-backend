import type { AccountRecord, AuthRepository, SessionRecord } from '../../src/repositories/auth.repository';
import { randomUUID } from 'node:crypto';

/** Test-only persistence; never imported by the application. */
export function authRepositoryFake(account: AccountRecord) {
  const sessions = new Map<string, SessionRecord>();
  const buckets = new Map<string, number>();
  let findCalls = 0;
  const repository: AuthRepository = {
    async findAccount(email) { findCalls++; return email === account.email ? account : null; },
    async consumeAttempts(inputs) {
      let allowed = true;
      for (const input of inputs) {
        const count = (buckets.get(input.key) ?? 0) + 1;
        buckets.set(input.key, count);
        if (count > input.limit) allowed = false;
      }
      return allowed;
    },
    async issueSession(input) {
      if (input.previousHash) {
        const previous = sessions.get(input.previousHash);
        if (previous) previous.revokedAt = input.now;
      }
      const record: SessionRecord = { id: randomUUID(), expiresAt: input.expiresAt, revokedAt: null, user: account };
      sessions.set(input.tokenHash, record);
      return { id: record.id };
    },
    async findSession(hash) { return sessions.get(hash) ?? null; },
    async revokeSession(id, userId, now) {
      for (const session of sessions.values()) if (session.id === id && session.user.id === userId) session.revokedAt = now;
    },
  };
  return { repository, sessions, buckets, account, get findCalls() { return findCalls; } };
}
