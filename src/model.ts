export const TICKET_STATUSES = ['open', 'pending', 'closed'] as const;
export const AUTHOR_ROLES = ['user', 'staff', 'bot'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type AuthorRole = (typeof AUTHOR_ROLES)[number];

export const CLOSED_STATUS: TicketStatus = 'closed';

export interface TicketMessage {
  author: string;
  authorRole: AuthorRole;
  timestamp: Date;
}

export interface Ticket {
  id: string;
  createdAt: Date;
  closedAt?: Date;
  user: string;
  staff?: string;
  category: string;
  status: TicketStatus;
  messages: TicketMessage[];
}

export const BYTES_PER_MIB = 1024 * 1024;

export const LIMITS = {
  maxTickets: 100_000,
  maxMessagesPerTicket: 10_000,
  maxTextLength: 256,
  maxReportedIssues: 50,
  maxFileBytes: 50 * BYTES_PER_MIB,
} as const;
