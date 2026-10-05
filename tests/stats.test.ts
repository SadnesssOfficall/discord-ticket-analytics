import { describe, expect, it } from 'vitest';
import { analyze } from '../src/stats/analyze.js';
import { summarize } from '../src/stats/math.js';
import { firstResponseMs, resolutionMs } from '../src/stats/response.js';
import { isoWeekKey, zonedParts } from '../src/stats/time.js';
import { MS_PER_HOUR, MS_PER_MINUTE } from '../src/stats/units.js';
import { at, message, SAMPLE_TICKETS, ticket } from './helpers.js';

describe('summarize', () => {
  it('computes average, median and nearest-rank p90', () => {
    expect(summarize([10, 20, 60])).toEqual({ average: 30, median: 20, p90: 60 });
    expect(summarize([4, 1, 3, 2])).toEqual({ average: 2.5, median: 2.5, p90: 4 });
  });

  it('uses the nearest rank for p90 on ten values', () => {
    expect(summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]).p90).toBe(9);
  });

  it('returns nulls for no data and does not mutate the input', () => {
    expect(summarize([])).toEqual({ average: null, median: null, p90: null });
    const input = [3, 1, 2];
    summarize(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('firstResponseMs', () => {
  const created = at('2026-03-02T09:00:00Z');

  it('measures from the first user message to the first staff message', () => {
    const subject = ticket({
      id: 'x',
      createdAt: created,
      messages: [
        message('user', '2026-03-02T09:05:00Z'),
        message('staff', '2026-03-02T09:25:00Z'),
        message('staff', '2026-03-02T09:30:00Z'),
      ],
    });
    expect(firstResponseMs(subject)).toBe(20 * MS_PER_MINUTE);
  });

  it('ignores bot messages and staff messages before the user spoke', () => {
    const subject = ticket({
      id: 'x',
      createdAt: created,
      messages: [
        message('staff', '2026-03-02T09:01:00Z'),
        message('user', '2026-03-02T09:05:00Z'),
        message('bot', '2026-03-02T09:06:00Z'),
        message('staff', '2026-03-02T10:05:00Z'),
      ],
    });
    expect(firstResponseMs(subject)).toBe(MS_PER_HOUR);
  });

  it('is null without a user message or without any staff reply', () => {
    expect(
      firstResponseMs(
        ticket({
          id: 'a',
          createdAt: created,
          messages: [message('staff', '2026-03-02T09:05:00Z')],
        }),
      ),
    ).toBeNull();
    expect(
      firstResponseMs(
        ticket({
          id: 'b',
          createdAt: created,
          messages: [
            message('user', '2026-03-02T09:05:00Z'),
            message('bot', '2026-03-02T09:06:00Z'),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('counts an instant reply as zero', () => {
    expect(
      firstResponseMs(
        ticket({
          id: 'c',
          createdAt: created,
          messages: [
            message('user', '2026-03-02T09:05:00Z'),
            message('staff', '2026-03-02T09:05:00Z'),
          ],
        }),
      ),
    ).toBe(0);
  });
});

describe('resolutionMs', () => {
  it('is only defined for closed tickets with a close time', () => {
    const closed = ticket({
      id: 'x',
      createdAt: at('2026-03-02T09:00:00Z'),
      closedAt: at('2026-03-02T11:00:00Z'),
      status: 'closed',
    });
    expect(resolutionMs(closed)).toBe(2 * MS_PER_HOUR);
    expect(resolutionMs({ ...closed, status: 'open' })).toBeNull();
  });
});

describe('analyze', () => {
  const result = analyze(SAMPLE_TICKETS);

  it('counts total, open and closed tickets', () => {
    expect(result.totals).toEqual({ tickets: 4, open: 2, closed: 2 });
  });

  it('computes first response statistics from hand-calculated values', () => {
    expect(result.firstResponse).toEqual({
      answered: 3,
      unanswered: 1,
      averageMs: 30 * MS_PER_MINUTE,
      medianMs: 20 * MS_PER_MINUTE,
      p90Ms: 60 * MS_PER_MINUTE,
    });
  });

  it('computes the average resolution time over closed tickets only', () => {
    expect(result.resolution).toEqual({ resolved: 2, averageMs: 90 * MS_PER_MINUTE });
  });

  it('groups tickets by staff with their average response time', () => {
    expect(result.byStaff).toEqual([
      { staff: 'alice', tickets: 2, averageFirstResponseMs: 35 * MS_PER_MINUTE },
      { staff: 'bob', tickets: 1, averageFirstResponseMs: 20 * MS_PER_MINUTE },
    ]);
  });

  it('falls back to the first staff author when the ticket has no staff field', () => {
    const subject = ticket({
      id: 'x',
      createdAt: at('2026-03-02T09:00:00Z'),
      messages: [
        message('user', '2026-03-02T09:00:00Z'),
        message('staff', '2026-03-02T09:30:00Z', 'zed'),
      ],
    });
    expect(analyze([subject]).byStaff).toEqual([
      { staff: 'zed', tickets: 1, averageFirstResponseMs: 30 * MS_PER_MINUTE },
    ]);
  });

  it('groups by category and breaks ties alphabetically', () => {
    expect(result.byCategory).toEqual([
      { category: 'billing', tickets: 2 },
      { category: 'support', tickets: 2 },
    ]);
  });

  it('lists the busiest hours, most tickets first', () => {
    expect(result.byHour[9]).toBe(3);
    expect(result.byHour[14]).toBe(1);
    expect(result.peakHours).toEqual([
      { hour: 9, tickets: 3 },
      { hour: 14, tickets: 1 },
    ]);
    expect(analyze(SAMPLE_TICKETS, { peakHours: 1 }).peakHours).toHaveLength(1);
  });

  it('builds daily, weekly (ISO) and monthly statistics', () => {
    expect(result.daily).toEqual([
      { period: '2026-03-02', created: 2, closed: 2 },
      { period: '2026-03-03', created: 1, closed: 0 },
      { period: '2026-03-09', created: 1, closed: 0 },
    ]);
    expect(result.weekly).toEqual([
      { period: '2026-W10', created: 3, closed: 2 },
      { period: '2026-W11', created: 1, closed: 0 },
    ]);
    expect(result.monthly).toEqual([{ period: '2026-03', created: 4, closed: 2 }]);
  });

  it('handles an empty data set', () => {
    const empty = analyze([]);
    expect(empty.totals).toEqual({ tickets: 0, open: 0, closed: 0 });
    expect(empty.firstResponse.averageMs).toBeNull();
    expect(empty.peakHours).toEqual([]);
    expect(empty.daily).toEqual([]);
  });

  it('filters by creation date, inclusive start and exclusive end', () => {
    const filtered = analyze(SAMPLE_TICKETS, {
      from: at('2026-03-02T09:30:00Z'),
      to: at('2026-03-09T09:15:00Z'),
    });
    expect(filtered.totals.tickets).toBe(2);
    expect(filtered.range).toEqual({
      from: '2026-03-02T09:30:00.000Z',
      to: '2026-03-09T09:15:00.000Z',
    });
  });

  it('rejects invalid options', () => {
    expect(() => analyze([], { timeZone: 'Mars/Base' })).toThrow('unknown time zone');
    expect(() => analyze([], { peakHours: 0 })).toThrow('peak hours');
    expect(() => analyze([], { peakHours: 25 })).toThrow('peak hours');
    expect(() =>
      analyze([], { from: at('2026-03-02T00:00:00Z'), to: at('2026-03-01T00:00:00Z') }),
    ).toThrow('earlier than range end');
    expect(() => analyze([], { from: new Date('nope') })).toThrow('invalid date');
  });
});

describe('time zones', () => {
  it('moves tickets across midnight when the zone changes', () => {
    const subject = [ticket({ id: 'x', createdAt: at('2026-03-01T23:30:00Z') })];
    expect(analyze(subject, { timeZone: 'UTC' }).daily[0]?.period).toBe('2026-03-01');
    const tokyo = analyze(subject, { timeZone: 'Asia/Tokyo' });
    expect(tokyo.daily[0]?.period).toBe('2026-03-02');
    expect(tokyo.peakHours[0]?.hour).toBe(8);
  });

  it('skips the nonexistent local hour on spring-forward', () => {
    const subjects = [
      ticket({ id: 'a', createdAt: at('2026-03-08T06:59:00Z') }),
      ticket({ id: 'b', createdAt: at('2026-03-08T07:00:00Z') }),
    ];
    const { byHour } = analyze(subjects, { timeZone: 'America/New_York' });
    expect([byHour[1], byHour[2], byHour[3]]).toEqual([1, 0, 1]);
  });

  it('counts the repeated local hour twice on fall-back', () => {
    const subjects = [
      ticket({ id: 'a', createdAt: at('2026-11-01T05:30:00Z') }),
      ticket({ id: 'b', createdAt: at('2026-11-01T06:30:00Z') }),
    ];
    const { byHour } = analyze(subjects, { timeZone: 'America/New_York' });
    expect(byHour[1]).toBe(2);
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(zonedParts(at('2026-03-02T00:00:00Z'), 'UTC').hour).toBe(0);
  });

  it('puts the Sunday before and the Monday after the week boundary in different ISO weeks', () => {
    const week = (iso: string) => isoWeekKey(zonedParts(at(iso), 'UTC'));
    expect(week('2026-03-08T23:59:59Z')).toBe('2026-W10');
    expect(week('2026-03-09T00:00:00Z')).toBe('2026-W11');
  });

  it('assigns days near New Year to the correct ISO year', () => {
    const week = (iso: string) => isoWeekKey(zonedParts(at(iso), 'UTC'));
    expect(week('2027-01-01T12:00:00Z')).toBe('2026-W53');
    expect(week('2024-12-30T12:00:00Z')).toBe('2025-W01');
    expect(week('2026-01-01T12:00:00Z')).toBe('2026-W01');
  });

  it('uses the zone, not UTC, for the week of a ticket', () => {
    const subject = [ticket({ id: 'x', createdAt: at('2026-03-08T23:30:00Z') })];
    expect(analyze(subject, { timeZone: 'Asia/Tokyo' }).weekly[0]?.period).toBe('2026-W11');
  });
});
