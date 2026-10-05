import { TicketDataError, type DataIssue } from './errors.js';
import {
  AUTHOR_ROLES,
  CLOSED_STATUS,
  LIMITS,
  TICKET_STATUSES,
  type AuthorRole,
  type Ticket,
  type TicketMessage,
  type TicketStatus,
} from './model.js';
import { hasUnsafeCharacters } from './text.js';
import { parseTimestamp } from './timestamp.js';

const TIMESTAMP_HINT = 'must be an ISO 8601 timestamp with a time zone, e.g. 2026-03-01T12:00:00Z';

export interface RawMessage {
  location: string;
  fields: unknown;
}

export interface RawTicket {
  location: string;
  fields: unknown;
  messages: RawMessage[];
}

export class IssueCollector {
  private readonly issues: DataIssue[] = [];
  private omitted = 0;

  add(location: string, message: string): void {
    if (this.issues.length < LIMITS.maxReportedIssues) this.issues.push({ location, message });
    else this.omitted++;
  }

  finish(): void {
    if (this.issues.length > 0) throw new TicketDataError(this.issues, this.omitted);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class RecordReader {
  ok = true;
  private readonly record: Record<string, unknown>;

  constructor(
    fields: unknown,
    private readonly location: string,
    private readonly issues: IssueCollector,
  ) {
    if (isRecord(fields)) {
      this.record = fields;
    } else {
      this.record = {};
      this.fail('must be an object');
    }
  }

  fail(message: string): void {
    this.ok = false;
    this.issues.add(this.location, message);
  }

  private raw(name: string): unknown {
    return Object.hasOwn(this.record, name) ? this.record[name] : undefined;
  }

  text(name: string, required: boolean): string | undefined {
    const value = this.raw(name);
    if (value === undefined || value === null) {
      if (required) this.fail(`${name} is required`);
      return undefined;
    }
    if (typeof value !== 'string') {
      this.fail(`${name} must be a string`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      this.fail(`${name} must not be empty`);
    } else if (trimmed.length > LIMITS.maxTextLength) {
      this.fail(`${name} is longer than ${LIMITS.maxTextLength} characters`);
    } else if (hasUnsafeCharacters(trimmed)) {
      this.fail(`${name} contains control or bidirectional characters`);
    } else {
      return trimmed;
    }
    return undefined;
  }

  timestamp(name: string, required: boolean): Date | undefined {
    const value = this.text(name, required);
    if (value === undefined) return undefined;
    const parsed = parseTimestamp(value);
    if (parsed === undefined) this.fail(`${name} ${TIMESTAMP_HINT}`);
    return parsed;
  }

  choice<const Value extends string>(name: string, allowed: readonly Value[]): Value | undefined {
    const value = this.text(name, true)?.toLowerCase();
    if (value === undefined) return undefined;
    const match = allowed.find((candidate) => candidate === value);
    if (match === undefined) this.fail(`${name} must be one of: ${allowed.join(', ')}`);
    return match;
  }
}

function buildMessage(raw: RawMessage, issues: IssueCollector): TicketMessage | undefined {
  const reader = new RecordReader(raw.fields, raw.location, issues);
  const author = reader.text('author', true);
  const authorRole = reader.choice<AuthorRole>('authorRole', AUTHOR_ROLES);
  const timestamp = reader.timestamp('timestamp', true);
  if (!reader.ok || author === undefined || authorRole === undefined || timestamp === undefined) {
    return undefined;
  }
  return { author, authorRole, timestamp };
}

function buildTicket(raw: RawTicket, issues: IssueCollector): Ticket | undefined {
  const reader = new RecordReader(raw.fields, raw.location, issues);
  const id = reader.text('id', true);
  const user = reader.text('user', true);
  const category = reader.text('category', true);
  const staff = reader.text('staff', false);
  const status = reader.choice<TicketStatus>('status', TICKET_STATUSES);
  const createdAt = reader.timestamp('createdAt', true);
  const closedAt = reader.timestamp('closedAt', false);

  if (raw.messages.length > LIMITS.maxMessagesPerTicket) {
    reader.fail(`has more than ${LIMITS.maxMessagesPerTicket} messages`);
  }
  const built = raw.messages.map((message) => ({
    location: message.location,
    message: buildMessage(message, issues),
  }));

  if (
    !reader.ok ||
    id === undefined ||
    user === undefined ||
    category === undefined ||
    status === undefined ||
    createdAt === undefined
  ) {
    return undefined;
  }

  if (closedAt !== undefined && closedAt < createdAt) {
    reader.fail('closedAt is earlier than createdAt');
  }
  if (status === CLOSED_STATUS && closedAt === undefined) {
    reader.fail('a closed ticket needs closedAt');
  }
  if (status !== CLOSED_STATUS && closedAt !== undefined) {
    reader.fail(`closedAt is set but status is "${status}"`);
  }

  const messages: TicketMessage[] = [];
  for (const { location, message } of built) {
    if (message === undefined) continue;
    if (message.timestamp < createdAt) {
      issues.add(location, 'timestamp is earlier than the ticket createdAt');
      reader.ok = false;
    } else {
      messages.push(message);
    }
  }
  if (!reader.ok || built.some((entry) => entry.message === undefined)) return undefined;

  messages.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  return { id, createdAt, closedAt, user, staff, category, status, messages };
}

export function buildTickets(raws: readonly RawTicket[], issues: IssueCollector): Ticket[] {
  if (raws.length > LIMITS.maxTickets) {
    throw new TicketDataError([
      { location: 'input', message: `more than ${LIMITS.maxTickets} tickets` },
    ]);
  }
  const firstSeen = new Map<string, string>();
  const tickets: Ticket[] = [];
  for (const raw of raws) {
    const ticket = buildTicket(raw, issues);
    if (ticket === undefined) continue;
    const previous = firstSeen.get(ticket.id);
    if (previous === undefined) {
      firstSeen.set(ticket.id, raw.location);
      tickets.push(ticket);
    } else {
      issues.add(
        raw.location,
        `duplicate id ${JSON.stringify(ticket.id)} (first used at ${previous})`,
      );
    }
  }
  issues.finish();
  return tickets;
}
