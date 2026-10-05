import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';
import { run } from '../src/cli/main.js';
import type { CliIo } from '../src/cli/runtime.js';
import type { AuthorRole, Ticket, TicketMessage } from '../src/model.js';

const workspaces: string[] = [];

afterEach(() => {
  for (const directory of workspaces.splice(0)) rmSync(directory, { recursive: true, force: true });
});

export function workspace(files: Record<string, string> = {}): string {
  const directory = mkdtempSync(join(tmpdir(), 'ticket-analytics-'));
  workspaces.push(directory);
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return directory;
}

export async function cli(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  extra: Partial<CliIo> = {},
) {
  let stdout = '';
  let stderr = '';
  const code = await run(args, {
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
    cwd,
    env,
    ...extra,
  });
  return { code, stdout, stderr };
}

export function message(role: AuthorRole, iso: string, author: string = role): TicketMessage {
  return { author, authorRole: role, timestamp: new Date(iso) };
}

export function ticket(fields: Partial<Ticket> & Pick<Ticket, 'id' | 'createdAt'>): Ticket {
  return {
    user: 'user-1',
    category: 'support',
    status: 'open',
    messages: [],
    ...fields,
  };
}

export function at(iso: string): Date {
  return new Date(iso);
}

export const SAMPLE_TICKETS: Ticket[] = [
  ticket({
    id: 'T1',
    createdAt: at('2026-03-02T09:00:00Z'),
    closedAt: at('2026-03-02T11:00:00Z'),
    status: 'closed',
    staff: 'alice',
    category: 'billing',
    messages: [
      message('user', '2026-03-02T09:00:00Z', 'u1'),
      message('bot', '2026-03-02T09:01:00Z', 'helper'),
      message('staff', '2026-03-02T09:10:00Z', 'alice'),
    ],
  }),
  ticket({
    id: 'T2',
    createdAt: at('2026-03-02T09:30:00Z'),
    closedAt: at('2026-03-02T10:30:00Z'),
    status: 'closed',
    staff: 'bob',
    messages: [
      message('user', '2026-03-02T09:30:00Z', 'u2'),
      message('staff', '2026-03-02T09:50:00Z', 'bob'),
    ],
  }),
  ticket({
    id: 'T3',
    createdAt: at('2026-03-03T14:00:00Z'),
    messages: [
      message('user', '2026-03-03T14:00:00Z', 'u3'),
      message('bot', '2026-03-03T14:05:00Z', 'helper'),
    ],
  }),
  ticket({
    id: 'T4',
    createdAt: at('2026-03-09T09:15:00Z'),
    staff: 'alice',
    category: 'billing',
    messages: [
      message('user', '2026-03-09T09:15:00Z', 'u4'),
      message('staff', '2026-03-09T10:15:00Z', 'alice'),
    ],
  }),
];

export const TICKETS_JSON = JSON.stringify([
  {
    id: 'A-1',
    createdAt: '2026-03-02T09:00:00Z',
    closedAt: '2026-03-02T11:00:00Z',
    user: 'alice',
    staff: 'mod',
    category: 'billing',
    status: 'closed',
    messages: [
      { author: 'alice', authorRole: 'user', timestamp: '2026-03-02T09:00:00Z' },
      { author: 'mod', authorRole: 'staff', timestamp: '2026-03-02T09:05:00Z' },
    ],
  },
  {
    id: 'A-2',
    createdAt: '2026-03-03T10:00:00Z',
    user: 'bob',
    category: 'support',
    status: 'open',
    messages: [{ author: 'bob', authorRole: 'user', timestamp: '2026-03-03T10:00:00Z' }],
  },
]);

export const BOM = String.fromCharCode(0xfeff);
