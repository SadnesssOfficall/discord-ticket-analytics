import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli } from './helpers.js';

const root = resolve(import.meta.dirname, '..');

describe('bundled examples', () => {
  it('validate and analyze to the same numbers in JSON and CSV form', async () => {
    const fromJson = await cli(['analyze', 'examples/tickets.json', '--json'], root);
    const fromCsv = await cli(
      ['analyze', 'examples/tickets.csv', '-m', 'examples/messages.csv', '--json'],
      root,
    );
    expect(fromJson.code).toBe(0);
    expect(fromCsv.code).toBe(0);
    const json = JSON.parse(fromJson.stdout) as { totals: { tickets: number } };
    const csv = JSON.parse(fromCsv.stdout) as { totals: { tickets: number }; byStaff: unknown[] };
    expect(json.totals.tickets).toBe(2);
    expect(csv.totals.tickets).toBe(4);
    expect(csv.byStaff).toHaveLength(2);
  });
});
