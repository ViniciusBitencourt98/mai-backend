import type { CalendarItem } from '../calendar/dto';
import type { DashboardQuery, DashboardTask, DashboardList } from '../dashboard/dto';
import type { DashboardRepository } from '../repositories/dashboard.repository';
import type { CalendarDependencies } from './calendar.service';
import { addDays, dayStart } from '../dashboard/time';
import { localToday } from '../tasks/dto';
import { timezoneDto } from '../recurrence/dto';
import { HttpError } from '../errors/http-error';
const key = (item: CalendarItem) => item.type + ':' + item.id;
export class DashboardService {
  constructor(private readonly repository: DashboardRepository, private readonly calendar: CalendarDependencies, private readonly now = () => new Date()) {}
  async get(ownerId: string, query: DashboardQuery, timezone: string) {
    if (!timezoneDto.safeParse(timezone).success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid session timezone');
    const date = query.date ?? localToday(this.now(), timezone);
    const pastDate = addDays(date, -30), nextDate = addDays(date, 1), endDate = addDays(date, 8);
    const start = dayStart(date, timezone, true), next = dayStart(nextDate, timezone);
    const past = dayStart(pastDate, timezone), end = dayStart(endDate, timezone);
    // Two disjoint bounded windows, no repeated aggregation for each response list/page.
    const { history, horizon } = await this.calendar.run(async (s) => ({
      history: await s.collect(ownerId, { from: past, to: start, types: ['TASK'] }, timezone),
      horizon: await s.collect(ownerId, { from: start, to: end, types: ['TASK', 'EVENT', 'PUBLICATION'] }, timezone),
    }));
    if (history.items.length + horizon.items.length > 10000) throw new HttpError(409, 'DASHBOARD_LIMIT', 'Dashboard maximum 10000 aggregated items');
    const civilBounds = new Map<string, { first: string; last: string }>();
    const civil = (zone: string) => {
      let bounds = civilBounds.get(zone);
      if (!bounds) { bounds = { first: localToday(start, zone), last: localToday(new Date(next.getTime() - 1), zone) }; civilBounds.set(zone, bounds); }
      return bounds;
    };
    const isToday = (item: CalendarItem) => {
      if (item.type === 'TASK') return item.date >= civil(item.timezone).first && item.date <= civil(item.timezone).last;
      if (item.type === 'EVENT') return item.startAt < next.toISOString() && item.endAt > start.toISOString();
      return item.scheduledAt >= start.toISOString() && item.scheduledAt < next.toISOString();
    };
    const today = horizon.items.filter(isToday);
    const todayIds = new Set(today.map(key));
    const overdue = history.items.filter((item): item is DashboardTask => item.type === 'TASK' && !item.completed
      && item.date < civil(item.timezone).first && !todayIds.has(key(item)));
    const upcoming = horizon.items.filter((item) => !todayIds.has(key(item)));
    const upcomingTasks = upcoming.filter((item): item is DashboardTask => item.type === 'TASK' && !item.completed);
    const upcomingEvents = upcoming.filter((item) => item.type === 'EVENT');
    const upcomingPublications = upcoming.filter((item) => item.type === 'PUBLICATION' && item.status !== 'PUBLISHED');
    const list = <T extends CalendarItem>(items: T[]): DashboardList<T> => ({ items: items.slice(0, query.limit), hasMore: items.length > query.limit });
    const pendingTasks = await this.repository.pendingTasks(ownerId);
    return {
      date, timezone, limit: query.limit,
      windows: { today: { from: start.toISOString(), to: next.toISOString() }, overdue: { from: past.toISOString(), to: start.toISOString(), days: 30 }, upcoming: { from: next.toISOString(), to: end.toISOString(), days: 7 } },
      counts: { pendingTasks, overdueTasks: overdue.length, todayActivities: today.length,
        plannedPublications: horizon.items.filter((item) => item.type === 'PUBLICATION' && item.status !== 'PUBLISHED').length },
      today: list(today), overdueTasks: list(overdue), upcomingTasks: list(upcomingTasks), upcomingEvents: list(upcomingEvents), upcomingPublications: list(upcomingPublications),
    };
  }
}
export interface DashboardDependencies { run<T>(operation: (service: DashboardService) => Promise<T>): Promise<T>; }
