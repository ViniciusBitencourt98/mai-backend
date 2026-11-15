import { synchronizeOwnerReminders } from './domain-reminders';
import type { PrismaClient } from '../../generated/prisma/client';
import type { PreferencesRepository } from '../../repositories/preferences.repository';
import { preferenceDefaults } from '../../preferences/dto';
const select = { name: true, preferences: { select: { timezone: true, emailEnabled: true, dailyDigestEnabled: true, dailyDigestTime: true } } } as const;
const response = (row: { name: string; preferences: { timezone: string; emailEnabled: boolean; dailyDigestEnabled: boolean; dailyDigestTime: string } | null }) => ({ name: row.name, ...(row.preferences ?? preferenceDefaults) });
export function createPreferencesRepository(client: PrismaClient, reminders = false): PreferencesRepository {
  return {
    async get(userId) {
      const row = await client.user.findFirst({ where: { id: userId, disabledAt: null }, select });
      return row ? response(row) : null;
    },
    update(userId, patch) {
      return client.$transaction(async (tx) => {
        // This scoped UPDATE rechecks account state and locks the user before upsert.
        // Touch audit time for preference changes; never write auth fields or other users.
        const user = await tx.user.updateMany({ where: { id: userId, disabledAt: null },
          data: { updatedAt: new Date(), ...(patch.name !== undefined ? { name: patch.name } : {}) } });
        if (!user.count) return null;
        const data = {
          ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
          ...(patch.emailEnabled !== undefined ? { emailEnabled: patch.emailEnabled } : {}),
          ...(patch.dailyDigestEnabled !== undefined ? { dailyDigestEnabled: patch.dailyDigestEnabled } : {}),
          ...(patch.dailyDigestTime !== undefined ? { dailyDigestTime: patch.dailyDigestTime } : {}),
        };
        await tx.userPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
        if (reminders && (patch.timezone !== undefined || patch.emailEnabled !== undefined || patch.dailyDigestEnabled !== undefined || patch.dailyDigestTime !== undefined)) await synchronizeOwnerReminders(tx, userId);
        const row = await tx.user.findFirst({ where: { id: userId, disabledAt: null }, select });
        return row ? response(row) : null;
      });
    },
  };
}
