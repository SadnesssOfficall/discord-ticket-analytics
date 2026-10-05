import type { Ticket } from '../model.js';

export interface TicketSource {
  load(): Promise<Ticket[]>;
}
