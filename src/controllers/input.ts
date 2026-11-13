import type { Request } from 'express';
import type { z } from 'zod';
import { HttpError } from '../errors/http-error';
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid input');
  return result.data;
}
export function json(req: Request) {
  if (!req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
  return req.body as unknown;
}
