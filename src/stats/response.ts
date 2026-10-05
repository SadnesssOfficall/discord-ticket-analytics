import { CLOSED_STATUS, type Ticket } from '../model.js';

export function firstResponseMs(ticket: Ticket): number | null {
  let userStart: number | undefined;
  for (const message of ticket.messages) {
    if (message.authorRole !== 'user') continue;
    const time = message.timestamp.getTime();
    if (userStart === undefined || time < userStart) userStart = time;
  }
  if (userStart === undefined) return null;

  let response: number | undefined;
  for (const message of ticket.messages) {
    if (message.authorRole !== 'staff') continue;
    const time = message.timestamp.getTime();
    if (time >= userStart && (response === undefined || time < response)) response = time;
  }
  return response === undefined ? null : response - userStart;
}

export function resolutionMs(ticket: Ticket): number | null {
  if (ticket.status !== CLOSED_STATUS || ticket.closedAt === undefined) return null;
  return ticket.closedAt.getTime() - ticket.createdAt.getTime();
}

export function assignedStaff(ticket: Ticket): string | undefined {
  if (ticket.staff !== undefined) return ticket.staff;
  let earliest: { author: string; time: number } | undefined;
  for (const message of ticket.messages) {
    if (message.authorRole !== 'staff') continue;
    const time = message.timestamp.getTime();
    if (earliest === undefined || time < earliest.time) earliest = { author: message.author, time };
  }
  return earliest?.author;
}
