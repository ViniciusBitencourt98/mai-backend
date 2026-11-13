import { HttpError } from '../errors/http-error';
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localStamp(at: Date, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    // Bounded cache: timezone comes from validated but user-defined configuration.
    if (formatters.size >= 100) formatters.clear();
    formatters.set(zone, formatter);
  }
  const p = formatter.formatToParts(at); const part = (name: string) => p.find((v) => v.type === name)!.value;
  return `${part('year').padStart(4,'0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${String(at.getUTCMilliseconds()).padStart(3,'0')}`;
}
/** Resolve a local clock using candidate offsets; gaps omitted, folds choose earlier. */
export function resolveLocal(stamp: string, zone: string): Date | null {
  const naive = Date.parse(stamp + 'Z'); const offsets = new Set<number>();
  for (const days of [-180,-2,0,2,180]) {
    const sample = new Date(naive + days * 86400000);
    offsets.add(Date.parse(localStamp(sample, zone) + 'Z') - sample.getTime());
  }
  const candidates = [...offsets].map((offset) => new Date(naive - offset))
    .filter((candidate) => candidate.getUTCFullYear() >= 1 && candidate.getUTCFullYear() <= 9999 && localStamp(candidate, zone) === stamp);
  return candidates.length ? new Date(Math.min(...candidates.map((v) => v.getTime()))) : null;
}
export function validTimes(startAt: Date, endAt: Date) {
  if (endAt <= startAt || endAt.getTime() - startAt.getTime() > 31 * 86400000)
    throw new HttpError(400, 'VALIDATION_ERROR', 'endAt must follow startAt; maximum duration 31 days');
}
export const overlaps = (start: Date, end: Date, from: Date, to: Date) => start < to && end > from;
