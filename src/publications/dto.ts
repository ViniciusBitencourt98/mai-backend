import { z } from 'zod';
import { instantDto } from '../events/dto';

export const publicationPlatformDto = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN', 'OTHER']);
export const publicationFormatDto = z.enum(['SHORT_VIDEO', 'LONG_VIDEO', 'REELS', 'STORIES', 'CAROUSEL', 'IMAGE', 'TEXT', 'OTHER']);
export const publicationStatusDto = z.enum(['IDEA', 'PLANNED', 'IN_PRODUCTION', 'READY', 'PUBLISHED', 'CANCELLED']);
const fields = {
  title: z.string().trim().min(1).max(200),
  caption: z.string().max(50000).nullable(),
  platform: publicationPlatformDto,
  format: publicationFormatDto,
  status: publicationStatusDto,
  scheduledAt: instantDto.nullable(),
  publishedAt: instantDto.nullable(),
  externalUrl: z.url({ protocol: /^https?$/ }).max(2000).nullable(),
  notes: z.string().max(50000).nullable(),
  projectId: z.uuid().nullable(),
};
export const createPublicationDto = z.object({
  ...fields, caption: fields.caption.default(null), status: fields.status.default('IDEA'),
  scheduledAt: fields.scheduledAt.default(null), publishedAt: fields.publishedAt.default(null),
  externalUrl: fields.externalUrl.default(null), notes: fields.notes.default(null), projectId: fields.projectId.default(null),
}).strict();
export const patchPublicationDto = z.object(fields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field');
const integer = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
export const publicationQueryDto = z.object({
  page: integer(1000000).default(1), limit: integer(100).default(20),
  q: z.string().trim().max(200).optional(),
  platform: publicationPlatformDto.optional(), format: publicationFormatDto.optional(), status: publicationStatusDto.optional(),
  projectId: z.uuid().optional(), from: instantDto.optional(), to: instantDto.optional(),
  includeArchived: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
  sort: z.enum(['scheduledAt', 'updatedAt']).default('scheduledAt'), order: z.enum(['asc', 'desc']).default('asc'),
}).strict().refine((query) => !query.from || !query.to || query.from < query.to, 'Invalid scheduled interval');
export const publicationIdDto = z.uuid();
export type CreatePublication = z.infer<typeof createPublicationDto>;
export type PatchPublication = z.infer<typeof patchPublicationDto>;
export type PublicationQuery = z.infer<typeof publicationQueryDto>;
export interface PublicationRecord extends CreatePublication {
  id: string; ownerId: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null;
}
export function publicationResponse(row: PublicationRecord) {
  return { ...row, scheduledAt: row.scheduledAt?.toISOString() ?? null, publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null };
}
