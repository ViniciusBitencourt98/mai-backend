import type { RuleInput } from './dto';
import { HttpError } from '../errors/http-error';
const DAY = 86400000;
export function validateRule(rule: RuleInput) {
  if ((rule.frequency === 'WEEKLY') !== (rule.weekdays.length > 0)) throw new HttpError(400, 'VALIDATION_ERROR', 'Only WEEKLY requires weekdays (ISO Monday=1)');
  if (rule.endDate && rule.endDate < rule.startDate) throw new HttpError(400, 'VALIDATION_ERROR', 'endDate precedes startDate');
}
/** Bounded civil-date arithmetic. No 24-hour increments of zoned instants. */
export function schedule(rule: RuleInput): string[] {
  validateRule(rule);
  const start = new Date(rule.startDate + 'T00:00:00Z');
  const startYear = start.getUTCFullYear(), month = start.getUTCMonth(), anchor = start.getUTCDate();
  const maxYear = Math.min(startYear + 100, 9999);
  const horizon = new Date(start); horizon.setUTCFullYear(maxYear);
  const stop = Math.min(horizon.getTime(), rule.endDate ? Date.parse(rule.endDate) : Infinity);
  const count = rule.count ?? 10000;
  const result: string[] = [];
  const startDay = (start.getUTCDay() + 6) % 7;
  for (let ms = start.getTime(), offset = 0; ms <= stop && result.length < count; ms += DAY, offset++) {
    const day = new Date(ms); let matches = false;
    if (rule.frequency === 'DAILY' || rule.frequency === 'CUSTOM_DAYS') matches = offset % rule.interval === 0;
    if (rule.frequency === 'WEEKLY') matches = Math.floor((offset + startDay) / 7) % rule.interval === 0 && rule.weekdays.includes((day.getUTCDay() + 6) % 7 + 1);
    if (rule.frequency === 'MONTHLY') {
      const months = (day.getUTCFullYear() - startYear) * 12 + day.getUTCMonth() - month;
      const last = new Date(day); last.setUTCMonth(day.getUTCMonth() + 1, 0);
      matches = months % rule.interval === 0 && day.getUTCDate() === Math.min(anchor, last.getUTCDate());
    }
    if (matches) result.push(day.toISOString().slice(0, 10));
  }
  return result;
}
