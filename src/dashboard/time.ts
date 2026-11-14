import { resolveLocal } from '../events/time';
import { localToday } from '../tasks/dto';
import { HttpError } from '../errors/http-error';
export function addDays(date: string, days: number) {
  const at = new Date(date + 'T00:00:00.000Z'); at.setUTCDate(at.getUTCDate() + days);
  if (at.getUTCFullYear() < 1 || at.getUTCFullYear() > 9999)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Dashboard window outside supported years');
  return at.toISOString().slice(0, 10);
}
export function dayStart(date: string, timezone: string, requireExists = false): Date {
  const exact = resolveLocal(date + 'T00:00:00.000', timezone);
  if (exact) return exact;
  // Midnight may be skipped by DST. Find the first instant of the civil day,
  // without adding 24 hours to a zoned timestamp. Entirely skipped days are invalid.
  const naive = Date.parse(date + 'T00:00:00.000Z');
  let low = naive - 36 * 3600000, high = naive + 36 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localToday(new Date(middle), timezone) < date) low = middle + 1;
    else high = middle;
  }
  const result = new Date(low);
  if (requireExists && localToday(result, timezone) !== date) throw new HttpError(400, 'VALIDATION_ERROR', 'Selected civil day does not exist');
  return result;
}
