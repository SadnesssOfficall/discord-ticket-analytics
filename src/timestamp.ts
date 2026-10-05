import { MINUTES_PER_HOUR, MS_PER_MINUTE } from './stats/units.js';

const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-](\d{2}):(\d{2}))$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MIN_YEAR = 1970;
const MONTHS_PER_YEAR = 12;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MILLIS_DIGITS = 3;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseTimestamp(value: string): Date | undefined {
  const match = TIMESTAMP.exec(value);
  if (match === null) return undefined;
  const part = (index: number): number => Number(match[index] ?? '0');
  const year = part(1);
  const month = part(2);
  const day = part(3);
  const hour = part(4);
  const minute = part(5);
  const second = part(6);
  const millis = Number((match[7] ?? '').slice(0, MILLIS_DIGITS).padEnd(MILLIS_DIGITS, '0'));
  const zone = match[8] ?? 'Z';
  const offsetHour = part(9);
  const offsetMinute = part(10);

  const calendarValid =
    year >= MIN_YEAR &&
    month >= 1 &&
    month <= MONTHS_PER_YEAR &&
    day >= 1 &&
    day <= daysInMonth(year, month);
  const clockValid = hour <= MAX_HOUR && minute <= MAX_MINUTE && second <= MAX_MINUTE;
  const offsetValid = offsetHour <= MAX_HOUR && offsetMinute <= MAX_MINUTE;
  if (!calendarValid || !clockValid || !offsetValid) return undefined;

  const sign = zone.startsWith('-') ? -1 : 1;
  const offsetMs = sign * (offsetHour * MINUTES_PER_HOUR + offsetMinute) * MS_PER_MINUTE;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMs);
}

export function parseRangeBoundary(value: string): Date | undefined {
  return parseTimestamp(DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value);
}
