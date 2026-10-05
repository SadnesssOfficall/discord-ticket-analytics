import { OptionError } from '../errors.js';
import { CLOSED_STATUS, type Ticket } from '../model.js';
import { mean, summarize } from './math.js';
import { assignedStaff, firstResponseMs, resolutionMs } from './response.js';
import {
  assertTimeZone,
  DEFAULT_TIME_ZONE,
  dayKey,
  isoWeekKey,
  monthKey,
  cachedZonedParts,
  type ZonedParts,
} from './time.js';
import { HOURS_PER_DAY } from './units.js';

export const DEFAULT_PEAK_HOURS = 3;

export interface AnalyzeOptions {
  timeZone?: string;
  from?: Date;
  to?: Date;
  peakHours?: number;
}

export interface StaffStat {
  staff: string;
  tickets: number;
  averageFirstResponseMs: number | null;
}

export interface CategoryStat {
  category: string;
  tickets: number;
}

export interface HourStat {
  hour: number;
  tickets: number;
}

export interface PeriodStat {
  period: string;
  created: number;
  closed: number;
}

export interface Analysis {
  timeZone: string;
  range: { from: string | null; to: string | null };
  totals: { tickets: number; open: number; closed: number };
  firstResponse: {
    answered: number;
    unanswered: number;
    averageMs: number | null;
    medianMs: number | null;
    p90Ms: number | null;
  };
  resolution: { resolved: number; averageMs: number | null };
  byStaff: StaffStat[];
  byCategory: CategoryStat[];
  byHour: number[];
  peakHours: HourStat[];
  daily: PeriodStat[];
  weekly: PeriodStat[];
  monthly: PeriodStat[];
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function periodStats(
  tickets: readonly Ticket[],
  partsOf: (date: Date) => ZonedParts,
  keyOf: (parts: ZonedParts) => string,
): PeriodStat[] {
  const periods = new Map<string, PeriodStat>();
  const entry = (date: Date): PeriodStat => {
    const period = keyOf(partsOf(date));
    let stat = periods.get(period);
    if (stat === undefined) {
      stat = { period, created: 0, closed: 0 };
      periods.set(period, stat);
    }
    return stat;
  };
  for (const ticket of tickets) {
    entry(ticket.createdAt).created++;
    if (ticket.status === CLOSED_STATUS && ticket.closedAt !== undefined) {
      entry(ticket.closedAt).closed++;
    }
  }
  return [...periods.values()].sort((left, right) => compareText(left.period, right.period));
}

function staffStats(tickets: readonly Ticket[]): StaffStat[] {
  const grouped = new Map<string, { tickets: number; responses: number[] }>();
  for (const ticket of tickets) {
    const staff = assignedStaff(ticket);
    if (staff === undefined) continue;
    const group = grouped.get(staff) ?? { tickets: 0, responses: [] };
    group.tickets++;
    const response = firstResponseMs(ticket);
    if (response !== null) group.responses.push(response);
    grouped.set(staff, group);
  }
  return [...grouped.entries()]
    .map(([staff, group]) => ({
      staff,
      tickets: group.tickets,
      averageFirstResponseMs: mean(group.responses),
    }))
    .sort((left, right) => right.tickets - left.tickets || compareText(left.staff, right.staff));
}

function validateOptions(options: AnalyzeOptions, timeZone: string, peakHours: number): void {
  assertTimeZone(timeZone);
  if (!Number.isInteger(peakHours) || peakHours < 1 || peakHours > HOURS_PER_DAY) {
    throw new OptionError(`peak hours must be an integer from 1 to ${HOURS_PER_DAY}`);
  }
  const { from, to } = options;
  if ([from, to].some((date) => date !== undefined && Number.isNaN(date.getTime()))) {
    throw new OptionError('date range contains an invalid date');
  }
  if (from !== undefined && to !== undefined && from >= to) {
    throw new OptionError('range start must be earlier than range end');
  }
}

export function analyze(tickets: readonly Ticket[], options: AnalyzeOptions = {}): Analysis {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const peakCount = options.peakHours ?? DEFAULT_PEAK_HOURS;
  validateOptions(options, timeZone, peakCount);

  const { from, to } = options;
  const selected = tickets.filter(
    (ticket) =>
      (from === undefined || ticket.createdAt >= from) &&
      (to === undefined || ticket.createdAt < to),
  );

  const closed = selected.filter((ticket) => ticket.status === CLOSED_STATUS).length;
  const responses = selected.flatMap((ticket) => firstResponseMs(ticket) ?? []);
  const resolutions = selected.flatMap((ticket) => resolutionMs(ticket) ?? []);
  const responseSummary = summarize(responses);

  const partsOf = cachedZonedParts(timeZone);
  const byHour = Array.from({ length: HOURS_PER_DAY }, () => 0);
  for (const ticket of selected) {
    const { hour } = partsOf(ticket.createdAt);
    byHour[hour] = (byHour[hour] ?? 0) + 1;
  }
  const peakHours = byHour
    .map((count, hour) => ({ hour, tickets: count }))
    .filter((stat) => stat.tickets > 0)
    .sort((left, right) => right.tickets - left.tickets || left.hour - right.hour)
    .slice(0, peakCount);

  return {
    timeZone,
    range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    totals: { tickets: selected.length, open: selected.length - closed, closed },
    firstResponse: {
      answered: responses.length,
      unanswered: selected.length - responses.length,
      averageMs: responseSummary.average,
      medianMs: responseSummary.median,
      p90Ms: responseSummary.p90,
    },
    resolution: { resolved: resolutions.length, averageMs: mean(resolutions) },
    byStaff: staffStats(selected),
    byCategory: [...countBy(selected.map((ticket) => ticket.category)).entries()]
      .map(([category, count]) => ({ category, tickets: count }))
      .sort(
        (left, right) => right.tickets - left.tickets || compareText(left.category, right.category),
      ),
    byHour,
    peakHours,
    daily: periodStats(selected, partsOf, dayKey),
    weekly: periodStats(selected, partsOf, isoWeekKey),
    monthly: periodStats(selected, partsOf, monthKey),
  };
}
