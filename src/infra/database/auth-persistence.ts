import type { PrismaClient } from '../../generated/prisma/client';
import type { AuthRepository } from '../../repositories/auth.repository';

const userFields = { id: true, email: true, name: true, disabledAt: true,
  preferences: { select: { timezone: true, emailEnabled: true } } } as const;
function preferences<T extends { preferences: { timezone: string; emailEnabled: boolean } | null }>(user: T) {
  return { ...user, preferences: user.preferences ?? { timezone: 'America/Bahia', emailEnabled: false } };
}
export function createAuthRepository(client: PrismaClient): AuthRepository {
  return {
    async findAccount(email) {
      const user = await client.user.findUnique({ where: { email }, select: { ...userFields, passwordHash: true } });
      return user ? preferences(user) : null;
    },
    async consumeAttempts(buckets) {
      return client.$transaction(async (tx) => {
        let allowed = true;
        for (const bucket of buckets) {
          const record = await tx.authThrottle.upsert({ where: { key: bucket.key },
            create: { key: bucket.key, attempts: 1, expiresAt: bucket.expiresAt }, update: { attempts: { increment: 1 } } });
          if (record.attempts > bucket.limit) allowed = false;
        }
        return allowed;
      });
    },
    async issueSession(input) {
      return client.$transaction(async (tx) => {
        // Recheck disabled status in the session-creation transaction.
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { disabledAt: true } });
        if (!user || user.disabledAt) throw new Error('Account unavailable');
        if (input.previousHash) await tx.session.updateMany({ where: { tokenHash: input.previousHash, revokedAt: null }, data: { revokedAt: input.now } });
        return tx.session.create({ data: { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt }, select: { id: true } });
      });
    },
    async findSession(tokenHash) {
      const session = await client.session.findUnique({ where: { tokenHash },
        select: { id: true, expiresAt: true, revokedAt: true, user: { select: userFields } } });
      return session ? { ...session, user: preferences(session.user) } : null;
    },
    async revokeSession(id, userId, now) {
      await client.session.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: now } });
    },
  };
}
