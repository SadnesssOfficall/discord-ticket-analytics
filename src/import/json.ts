import { BOM } from './csv.js';
import { TicketDataError } from '../errors.js';
import { buildTickets, IssueCollector, type RawMessage, type RawTicket } from '../validate.js';
import type { Ticket } from '../model.js';

function messagesOf(fields: unknown, location: string, issues: IssueCollector): RawMessage[] {
  if (typeof fields !== 'object' || fields === null || !Object.hasOwn(fields, 'messages'))
    return [];
  const messages = (fields as { messages: unknown }).messages;
  if (messages === undefined || messages === null) return [];
  if (!Array.isArray(messages)) {
    issues.add(location, 'messages must be an array');
    return [];
  }
  return (messages as unknown[]).map((message, index) => ({
    location: `${location}, message #${index + 1}`,
    fields: message,
  }));
}

export function parseTicketsJson(text: string, label = 'tickets.json'): Ticket[] {
  let data: unknown;
  try {
    data = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text);
  } catch {
    throw new TicketDataError([{ location: label, message: 'is not valid JSON' }]);
  }
  if (!Array.isArray(data)) {
    throw new TicketDataError([
      { location: label, message: 'must contain a JSON array of tickets' },
    ]);
  }
  const issues = new IssueCollector();
  const raws: RawTicket[] = (data as unknown[]).map((fields, index) => {
    const location = `${label}: ticket #${index + 1}`;
    return { location, fields, messages: messagesOf(fields, location, issues) };
  });
  return buildTickets(raws, issues);
}
