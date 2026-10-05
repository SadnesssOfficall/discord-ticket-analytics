import { OptionError } from '../errors.js';
import { DAYS_PER_WEEK, HOURS_PER_DAY, MS_PER_DAY } from './units.js';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export const DEFAULT_TIME_ZONE = 'UTC';

const MONDAY_FIRST_OFFSET = 6;
const THURSDAY_INDEX = 3;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function assertTimeZone(timeZone: string): void {
  try {
    formatterFor(timeZone);
  } catch {
    throw new OptionError(`unknown time zone ${JSON.stringify(timeZone)}`);
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values = new Map<string, string>(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const read = (type: string): number => Number(values.get(type));
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % HOURS_PER_DAY,
  };
}

export function cachedZonedParts(timeZone: string): (date: Date) => ZonedParts {
  const cache = new Map<number, ZonedParts>();
  return (date) => {
    const key = date.getTime();
    let parts = cache.get(key);
    if (parts === undefined) {
      parts = zonedParts(date, timeZone);
      cache.set(key, parts);
    }
    return parts;
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function dayKey(parts: ZonedParts): string {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

export function monthKey(parts: ZonedParts): string {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}`;
}

export function isoWeekKey(parts: ZonedParts): string {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayBased = (date.getUTCDay() + MONDAY_FIRST_OFFSET) % DAYS_PER_WEEK;
  const thursday = new Date(date.getTime() + (THURSDAY_INDEX - mondayBased) * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();
  const dayOfYear = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / MS_PER_DAY);
  return `${pad(isoYear, 4)}-W${pad(Math.floor(dayOfYear / DAYS_PER_WEEK) + 1, 2)}`;
}
