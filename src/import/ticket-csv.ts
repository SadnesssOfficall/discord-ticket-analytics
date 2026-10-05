import { CsvSyntaxError, parseCsv } from './csv.js';
import type { Ticket } from '../model.js';
import { buildTickets, IssueCollector, type RawMessage, type RawTicket } from '../validate.js';

const MESSAGE_COLUMNS = ['ticketId', 'author', 'authorRole', 'timestamp'];

const REQUIRED_TICKET_COLUMNS = ['id', 'createdAt', 'user', 'category', 'status'];

export interface CsvTicketInput {
  ticketsText: string;
  ticketsLabel?: string;
  messagesText?: string;
  messagesLabel?: string;
}

interface Row {
  location: string;
  values: Map<string, string>;
}

function readTable(
  text: string,
  label: string,
  required: readonly string[],
  issues: IssueCollector,
): Row[] {
  let records;
  try {
    records = parseCsv(text);
  } catch (error) {
    if (!(error instanceof CsvSyntaxError)) throw error;
    issues.add(`${label}:${error.line}`, error.message);
    return [];
  }
  const [headerRecord, ...body] = records;
  if (headerRecord === undefined) {
    issues.add(label, 'is empty; expected a header row');
    return [];
  }
  const header = headerRecord.fields.map((name) => name.trim());
  const duplicate = header.find((name, index) => header.indexOf(name) !== index);
  if (duplicate !== undefined) {
    issues.add(`${label}:${headerRecord.line}`, `duplicate column ${JSON.stringify(duplicate)}`);
    return [];
  }
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    issues.add(`${label}:${headerRecord.line}`, `missing column(s): ${missing.join(', ')}`);
    return [];
  }
  const rows: Row[] = [];
  for (const record of body) {
    const location = `${label}:${record.line}`;
    if (record.fields.length === header.length) {
      rows.push({
        location,
        values: new Map(header.map((name, index) => [name, record.fields[index] ?? ''])),
      });
    } else {
      issues.add(location, `expected ${header.length} fields but found ${record.fields.length}`);
    }
  }
  return rows;
}

function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

export function parseTicketsCsv(input: CsvTicketInput): Ticket[] {
  const ticketsLabel = input.ticketsLabel ?? 'tickets.csv';
  const messagesLabel = input.messagesLabel ?? 'messages.csv';
  const issues = new IssueCollector();

  const raws: RawTicket[] = readTable(
    input.ticketsText,
    ticketsLabel,
    REQUIRED_TICKET_COLUMNS,
    issues,
  ).map((row) => ({
    location: row.location,
    messages: [],
    fields: {
      id: row.values.get('id'),
      createdAt: row.values.get('createdAt'),
      closedAt: blankToUndefined(row.values.get('closedAt')),
      user: row.values.get('user'),
      staff: blankToUndefined(row.values.get('staff')),
      category: row.values.get('category'),
      status: row.values.get('status'),
    },
  }));

  if (input.messagesText !== undefined) {
    const byId = new Map<string, RawMessage[]>();
    for (const raw of raws) {
      const id = (raw.fields as { id?: string }).id?.trim();
      if (id !== undefined && !byId.has(id)) byId.set(id, raw.messages);
    }
    for (const row of readTable(input.messagesText, messagesLabel, MESSAGE_COLUMNS, issues)) {
      const ticketId = row.values.get('ticketId')?.trim() ?? '';
      const target = byId.get(ticketId);
      if (target === undefined) {
        issues.add(row.location, `ticketId ${JSON.stringify(ticketId)} matches no ticket`);
      } else {
        target.push({
          location: row.location,
          fields: {
            author: row.values.get('author'),
            authorRole: row.values.get('authorRole'),
            timestamp: row.values.get('timestamp'),
          },
        });
      }
    }
  }

  return buildTickets(raws, issues);
}
