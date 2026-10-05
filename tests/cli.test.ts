import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cli, TICKETS_JSON, workspace } from './helpers.js';

const CSV_TICKETS =
  'id,createdAt,closedAt,user,staff,category,status\nC-1,2026-03-02T09:00:00Z,,a,,x,open\n';
const CSV_MESSAGES =
  'ticketId,author,authorRole,timestamp\nC-1,a,user,2026-03-02T09:00:00Z\nC-1,m,staff,2026-03-02T09:30:00Z\n';

describe('analyze', () => {
  it('prints a table by default', async () => {
    const directory = workspace({ 'tickets.json': TICKETS_JSON });
    const result = await cli(['analyze', 'tickets.json'], directory);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Summary');
    expect(result.stdout).toMatch(/First response, median\s+5m 0s/);
  });

  it('prints JSON that parses and respects the time zone and range options', async () => {
    const directory = workspace({ 'tickets.json': TICKETS_JSON });
    const result = await cli(
      ['analyze', 'tickets.json', '--json', '-z', 'Asia/Tokyo', '--from', '2026-03-03'],
      directory,
    );
    const parsed = JSON.parse(result.stdout) as { timeZone: string; totals: { tickets: number } };
    expect(parsed.timeZone).toBe('Asia/Tokyo');
    expect(parsed.totals.tickets).toBe(1);
  });

  it('prints CSV and joins a messages file', async () => {
    const directory = workspace({ 'tickets.csv': CSV_TICKETS, 'messages.csv': CSV_MESSAGES });
    const result = await cli(['analyze', 'tickets.csv', '-m', 'messages.csv', '--csv'], directory);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('summary,,firstResponseMedianMs,1800000');
  });

  it('exits 1 with located messages for invalid data and 2 for usage errors', async () => {
    const directory = workspace({ 'bad.json': '[{"id":"x"}]', 'tickets.json': TICKETS_JSON });
    const invalid = await cli(['analyze', 'bad.json'], directory);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain('bad.json: ticket #1');

    for (const args of [
      ['analyze'],
      ['analyze', 'tickets.json', '--json', '--csv'],
      ['analyze', 'tickets.json', '--timezone', 'Nowhere/Land'],
      ['analyze', 'tickets.json', '--from', 'tomorrow'],
      ['analyze', 'tickets.json', '--peak-hours', 'many'],
      ['analyze', 'tickets.json', '--max-bytes', '5'],
      ['analyze', 'tickets.json', '--bogus'],
      ['analyze', 'missing.json'],
      ['frobnicate'],
    ]) {
      const result = await cli(args, directory);
      expect(result.code, args.join(' ')).toBe(2);
      expect(result.stderr).toMatch(/^Error: /);
    }
  });

  it('rejects --discord combined with files', async () => {
    const result = await cli(['analyze', 'a.json', '--discord'], '.');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('cannot be combined');
  });
});

describe('validate', () => {
  it('prints counts', async () => {
    const directory = workspace({ 'tickets.json': TICKETS_JSON });
    expect((await cli(['validate', 'tickets.json'], directory)).stdout).toBe(
      'OK: 2 tickets, 3 messages\n',
    );
  });
});

describe('report', () => {
  it('writes a standalone HTML file and refuses to overwrite without --force', async () => {
    const directory = workspace({ 'tickets.json': TICKETS_JSON });
    const first = await cli(
      ['report', 'tickets.json', '-o', 'out.html', '--title', 'My <report>'],
      directory,
    );
    expect(first.code).toBe(0);
    const html = readFileSync(join(directory, 'out.html'), 'utf8');
    expect(html).toContain('<title>My &lt;report&gt;</title>');

    const again = await cli(['report', 'tickets.json', '-o', 'out.html'], directory);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('use --force');
    expect(
      (await cli(['report', 'tickets.json', '-o', 'out.html', '--force'], directory)).code,
    ).toBe(0);
  });

  it('never overwrites an input file and requires --output', async () => {
    const directory = workspace({ 'tickets.json': TICKETS_JSON });
    const clobber = await cli(
      ['report', 'tickets.json', '-o', 'tickets.json', '--force'],
      directory,
    );
    expect(clobber.code).toBe(2);
    expect(readFileSync(join(directory, 'tickets.json'), 'utf8')).toBe(TICKETS_JSON);
    expect((await cli(['report', 'tickets.json'], directory)).stderr).toContain('--output');
  });

  it('does not write anything when the data is invalid', async () => {
    const directory = workspace({ 'bad.json': '[]x' });
    expect((await cli(['report', 'bad.json', '-o', 'out.html'], directory)).code).toBe(1);
    expect(existsSync(join(directory, 'out.html'))).toBe(false);
  });
});

describe('general', () => {
  it('prints help and the version', async () => {
    const help = await cli(['--help'], '.');
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Usage:');
    expect((await cli(['analyze', '-h'], '.')).stdout).toContain('Usage:');
    expect((await cli(['--version'], '.')).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    const none = await cli([], '.');
    expect(none.code).toBe(2);
    expect(none.stderr).toContain('Usage:');
  });
});
