import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from '../stats/units.js';

const EMPTY_VALUE = '-';

const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;

export function formatDuration(ms: number | null): string {
  if (ms === null) return EMPTY_VALUE;
  let seconds = Math.round(ms / MS_PER_SECOND);
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  seconds -= days * SECONDS_PER_DAY;
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  seconds -= hours * SECONDS_PER_HOUR;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  seconds -= minutes * SECONDS_PER_MINUTE;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatHour(hour: number): string {
  const label = String(hour).padStart(2, '0');
  return `${label}:00-${label}:59`;
}
