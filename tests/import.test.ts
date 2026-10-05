import { describe, expect, it } from 'vitest';
import { TicketDataError } from '../src/errors.js';
import { parseTicketsJson } from '../src/import/json.js';
import { parseTicketsCsv } from '../src/import/ticket-csv.js';
import { parseTimestamp } from '../src/timestamp.js';
import { BOM } from './helpers.js';

function failure(action: () => unknown): TicketDataError {
  try {
    action();
  } catch (error) {
    if (error instanceof TicketDataError) return error;
    throw error;
  }
  throw new Error('expected a TicketDataError');
}

const base = {
  id: 'T1',
  createdAt: '2026-03-02T09:00:00Z',
  user: 'alice',
  category: 'support',
  status: 'open',
};

function json(...tickets: unknown[]): string {
  return JSON.stringify(tickets);
}

describe('parseTimestamp', () => {
  it('accepts offsets and fractional seconds', () => {
    expect(parseTimestamp('2026-03-02T10:00:00+01:00')?.toISOString()).toBe(
      '2026-03-02T09:00:00.000Z',
    );
    expect(parseTimestamp('2026-03-02T09:00:00.1234Z')?.getUTCMilliseconds()).toBe(123);
    expect(parseTimestamp('2026-03-02T09:00Z')?.toISOString()).toBe('2026-03-02T09:00:00.000Z');
  });

  it.each([
    '2026-02-30T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-03-02T24:00:00Z',
    '2026-03-02T09:00:00',
    '2026-03-02',
    'yesterday',
    '2026-03-02T09:00:60Z',
    '2026-03-02T09:00:00+25:00',
    '',
  ])('rejects %j', (value) => {
    expect(parseTimestamp(value)).toBeUndefined();
  });

  it('accepts a leap day only in leap years', () => {
    expect(parseTimestamp('2028-02-29T00:00:00Z')).toBeDefined();
    expect(parseTimestamp('2026-02-29T00:00:00Z')).toBeUndefined();
  });
});

describe('parseTicketsJson', () => {
  it('reads valid tickets, normalizes case and sorts messages by time', () => {
    const tickets = parseTicketsJson(
      json({
        ...base,
        status: 'OPEN',
        messages: [
          { author: 'b', authorRole: 'Staff', timestamp: '2026-03-02T09:30:00Z' },
          { author: 'a', authorRole: 'user', timestamp: '2026-03-02T09:10:00Z' },
        ],
      }),
    );
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.status).toBe('open');
    expect(tickets[0]?.messages.map((entry) => entry.authorRole)).toEqual(['user', 'staff']);
  });

  it('accepts tickets without messages and ignores a BOM', () => {
    expect(parseTicketsJson(`${BOM}${json(base)}`)).toHaveLength(1);
  });

  it('reports invalid JSON and non-array input without echoing the content', () => {
    expect(failure(() => parseTicketsJson('{oops')).message).toContain('is not valid JSON');
    expect(failure(() => parseTicketsJson('{"id":"x"}')).message).toContain('JSON array');
  });

  it('reports every problem with ticket and message positions', () => {
    const error = failure(() =>
      parseTicketsJson(
        json(
          { ...base, id: '' },
          { ...base, id: 'T2', createdAt: 'not-a-date' },
          {
            ...base,
            id: 'T3',
            messages: [{ author: 'a', authorRole: 'admin', timestamp: '2026-03-02T09:10:00Z' }],
          },
        ),
        'in.json',
      ),
    );
    expect(error.issues.map((issue) => issue.location)).toEqual([
      'in.json: ticket #1',
      'in.json: ticket #2',
      'in.json: ticket #3, message #1',
    ]);
    expect(error.message).toContain('id must not be empty');
    expect(error.message).toContain('createdAt must be an ISO 8601 timestamp');
    expect(error.message).toContain('authorRole must be one of: user, staff, bot');
  });

  it('rejects closedAt earlier than createdAt', () => {
    const error = failure(() =>
      parseTicketsJson(json({ ...base, status: 'closed', closedAt: '2026-03-01T09:00:00Z' })),
    );
    expect(error.message).toContain('closedAt is earlier than createdAt');
  });

  it('requires closedAt for closed tickets and forbids it for open ones', () => {
    expect(failure(() => parseTicketsJson(json({ ...base, status: 'closed' }))).message).toContain(
      'a closed ticket needs closedAt',
    );
    expect(
      failure(() => parseTicketsJson(json({ ...base, closedAt: '2026-03-03T09:00:00Z' }))).message,
    ).toContain('closedAt is set but status is "open"');
  });

  it('rejects messages that predate the ticket', () => {
    const error = failure(() =>
      parseTicketsJson(
        json({
          ...base,
          messages: [{ author: 'a', authorRole: 'user', timestamp: '2026-03-01T00:00:00Z' }],
        }),
      ),
    );
    expect(error.message).toContain('earlier than the ticket createdAt');
  });

  it('rejects duplicate ids and points at the first occurrence', () => {
    const error = failure(() => parseTicketsJson(json(base, base), 'dup.json'));
    expect(error.message).toContain('dup.json: ticket #2: duplicate id "T1" (first used at');
    expect(error.message).toContain('ticket #1');
  });

  it('rejects wrong types, non-object entries and non-array messages', () => {
    const error = failure(() =>
      parseTicketsJson(json({ ...base, user: 42 }, 'text', { ...base, id: 'T9', messages: {} })),
    );
    expect(error.message).toContain('user must be a string');
    expect(error.message).toContain('must be an object');
    expect(error.message).toContain('messages must be an array');
  });

  it('rejects control and bidirectional characters in names', () => {
    const control = failure(() => parseTicketsJson(json({ ...base, user: 'a\u001b[31mb' })));
    expect(control.message).toContain('control or bidirectional');
    const bidi = failure(() => parseTicketsJson(json({ ...base, category: 'x‮y' })));
    expect(bidi.message).toContain('control or bidirectional');
  });

  it('rejects overlong text and treats inherited property names as missing', () => {
    expect(
      failure(() => parseTicketsJson(json({ ...base, user: 'x'.repeat(300) }))).message,
    ).toContain('longer than 256');
    expect(failure(() => parseTicketsJson('[{"__proto__":{"id":"x"}}]')).message).toContain(
      'id is required',
    );
  });

  it('caps the number of reported problems', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({ ...base, id: `T${index}`, user: '' }));
    const error = failure(() => parseTicketsJson(JSON.stringify(many)));
    expect(error.issues).toHaveLength(50);
    expect(error.message).toContain('and 30 more problem(s) not shown');
  });
});

describe('parseTicketsCsv', () => {
  const header = 'id,createdAt,closedAt,user,staff,category,status\n';
  const messagesHeader = 'ticketId,author,authorRole,timestamp\n';

  it('joins tickets with their messages and handles quoted values with commas', () => {
    const tickets = parseTicketsCsv({
      ticketsText: `${BOM}${header}T1,2026-03-02T09:00:00Z,2026-03-02T10:00:00Z,"Doe, J",mod,"Billing, Team",closed\r\nT2,2026-03-02T09:00:00Z,,bob,,support,open\r\n`,
      messagesText: `${messagesHeader}T1,"Doe, J",user,2026-03-02T09:00:00Z\nT1,mod,staff,2026-03-02T09:20:00Z\n`,
    });
    expect(tickets).toHaveLength(2);
    expect(tickets[0]?.user).toBe('Doe, J');
    expect(tickets[0]?.category).toBe('Billing, Team');
    expect(tickets[0]?.messages).toHaveLength(2);
    expect(tickets[1]?.closedAt).toBeUndefined();
    expect(tickets[1]?.staff).toBeUndefined();
  });

  it('works without a messages file', () => {
    const tickets = parseTicketsCsv({
      ticketsText: `${header}T1,2026-03-02T09:00:00Z,,a,,x,open\n`,
    });
    expect(tickets[0]?.messages).toEqual([]);
  });

  it('allows columns in any order and ignores unknown columns', () => {
    const tickets = parseTicketsCsv({
      ticketsText:
        'status,extra,id,category,user,createdAt\nopen,ignored,T1,support,a,2026-03-02T09:00:00Z\n',
    });
    expect(tickets[0]?.id).toBe('T1');
  });

  it('reports line numbers of the CSV file, including after a multi-line field', () => {
    const error = failure(() =>
      parseTicketsCsv({
        ticketsText: `${header}T1,2026-03-02T09:00:00Z,,"a\nb",,x,open\nT2,bad,,a,,x,open\n`,
        ticketsLabel: 't.csv',
      }),
    );
    expect(error.issues.map((issue) => issue.location)).toEqual(['t.csv:2', 't.csv:4']);
  });

  it('reports missing and duplicate columns and wrong field counts', () => {
    expect(failure(() => parseTicketsCsv({ ticketsText: 'id,user\nT1,a\n' })).message).toContain(
      'missing column(s): createdAt, category, status',
    );
    expect(
      failure(() => parseTicketsCsv({ ticketsText: 'id,id,createdAt,user,category,status\n' }))
        .message,
    ).toContain('duplicate column "id"');
    expect(
      failure(() => parseTicketsCsv({ ticketsText: `${header}T1,2026-03-02T09:00:00Z\n` })).message,
    ).toContain('expected 7 fields but found 2');
    expect(failure(() => parseTicketsCsv({ ticketsText: '' })).message).toContain('empty');
  });

  it('reports malformed CSV with the line of the problem', () => {
    const error = failure(() =>
      parseTicketsCsv({ ticketsText: `${header}T1,"oops\n`, ticketsLabel: 't.csv' }),
    );
    expect(error.message).toContain('t.csv:2: quoted field is never closed');
  });

  it('rejects messages for unknown tickets and bad message rows', () => {
    const error = failure(() =>
      parseTicketsCsv({
        ticketsText: `${header}T1,2026-03-02T09:00:00Z,,a,,x,open\n`,
        messagesText: `${messagesHeader}T9,a,user,2026-03-02T09:00:00Z\nT1,a,robot,2026-03-02T09:00:00Z\n`,
        messagesLabel: 'm.csv',
      }),
    );
    expect(error.message).toContain('m.csv:2: ticketId "T9" matches no ticket');
    expect(error.message).toContain('m.csv:3');
    expect(error.message).toContain('authorRole must be one of');
  });

  it('rejects duplicate ticket ids', () => {
    const row = 'T1,2026-03-02T09:00:00Z,,a,,x,open\n';
    expect(
      failure(() => parseTicketsCsv({ ticketsText: header + row + row, ticketsLabel: 't.csv' }))
        .message,
    ).toContain('t.csv:3: duplicate id "T1"');
  });
});
