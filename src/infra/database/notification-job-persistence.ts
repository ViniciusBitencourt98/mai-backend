import type { PrismaClient } from '../../generated/prisma/client';
import type { NotificationJobRepository } from '../../repositories/notification-job.repository';
export function createNotificationJobRepository(client: PrismaClient): NotificationJobRepository {
  return {
    async due(now, limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid notification batch limit');
      // Discovery is advisory. The actual claim runs under users FOR UPDATE and a
      // conditional id+owner+status+leaseToken update, with an atomic audit insert.
      // Keeping user -> source -> outbox order avoids inversion with BE-017 writers.
      return client.notificationOutbox.findMany({
        where: { scheduledAt: { lte: now }, owner: { disabledAt: null }, OR: [
          { status: 'PENDING' },
          { status: 'RESERVED', reservedFrom: 'PENDING', leaseUntil: { lte: now } },
        ] },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: limit,
        select: { id: true, ownerId: true },
      });
    },
    locate(id) { return client.notificationOutbox.findUnique({ where: { id }, select: { id: true, ownerId: true } }); },
  };
}
