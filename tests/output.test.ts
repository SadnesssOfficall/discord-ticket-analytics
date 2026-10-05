import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/import/csv.js';
import { renderAnalysisCsv } from '../src/output/csv.js';
import { formatDuration } from '../src/output/format.js';
import { renderHtmlReport } from '../src/output/html.js';
import { renderAnalysisTable } from '../src/output/table.js';
import { analyze } from '../src/stats/analyze.js';
import { at, message, SAMPLE_TICKETS, ticket } from './helpers.js';

const PAYLOAD = '<script>alert(1)</script>"><img src=x onerror=alert(2)>&\'';

function hostileAnalysis() {
  return analyze([
    ticket({
      id: 'x',
      createdAt: at('2026-03-02T09:00:00Z'),
      category: PAYLOAD,
      staff: PAYLOAD,
      messages: [
        message('user', '2026-03-02T09:00:00Z'),
        message('staff', '2026-03-02T09:10:00Z', PAYLOAD),
      ],
    }),
  ]);
}

describe('formatDuration', () => {
  it.each([
    [null, '-'],
    [0, '0s'],
    [45_000, '45s'],
    [600_000, '10m 0s'],
    [3_723_000, '1h 2m 3s'],
    [90_061_000, '1d 1h 1m 1s'],
  ])('formats %j as %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('renderAnalysisTable', () => {
  it('prints the summary, staff, category and period sections', () => {
    const text = renderAnalysisTable(analyze(SAMPLE_TICKETS));
    expect(text).toContain('Time zone: UTC');
    expect(text).toMatch(/First response, median\s+20m 0s/);
    expect(text).toMatch(/alice\s+2\s+35m 0s/);
    expect(text).toMatch(/09:00-09:59\s+3/);
    expect(text).toContain('2026-W10');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('renders an empty data set without throwing', () => {
    expect(renderAnalysisTable(analyze([]))).toContain('Tickets');
  });
});

describe('renderAnalysisCsv', () => {
  it('produces parseable CSV with the documented columns', () => {
    const records = parseCsv(renderAnalysisCsv(analyze(SAMPLE_TICKETS)));
    expect(records[0]?.fields).toEqual(['section', 'key', 'metric', 'value']);
    expect(records.every((record) => record.fields.length === 4)).toBe(true);
    expect(records.some((record) => record.fields.join('|') === 'summary||tickets|4')).toBe(true);
    expect(records.some((record) => record.fields.join('|') === 'week|2026-W10|created|3')).toBe(
      true,
    );
  });

  it('neutralizes formula injection from user-controlled names', () => {
    const subject = analyze([
      ticket({ id: 'x', createdAt: at('2026-03-02T09:00:00Z'), category: '=cmd|calc' }),
    ]);
    expect(renderAnalysisCsv(subject)).toContain("'=cmd|calc");
  });
});

describe('renderHtmlReport', () => {
  const generatedAt = at('2026-10-05T00:00:00Z');

  it('is a standalone document without external resources or scripts', () => {
    const html = renderHtmlReport(analyze(SAMPLE_TICKETS), 'Weekly report', generatedAt);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Weekly report</title>');
    expect(html).not.toMatch(/<script|<link|<img|https?:\/\//i);
    expect(html).toContain('default-src &#39;none&#39;');
    expect(html).toContain('<svg');
    expect(html).toContain('2026-W10');
  });

  it('escapes hostile values everywhere they appear', () => {
    const html = renderHtmlReport(hostileAnalysis(), PAYLOAD, generatedAt);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=alert(2)>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(2)&gt;&amp;&#39;');
  });

  it('escapes a hostile time zone label and keeps attributes intact', () => {
    const analysis = { ...analyze([]), timeZone: '"><script>x</script>' };
    const html = renderHtmlReport(analysis, 'T', generatedAt);
    expect(html).not.toContain('<script>');
  });

  it('shows empty states when the range has no tickets', () => {
    expect(renderHtmlReport(analyze([]), 'Empty', generatedAt)).toContain('No data in this range.');
  });

  it('limits the daily chart to the latest 90 days', () => {
    const tickets = Array.from({ length: 120 }, (_, index) =>
      ticket({ id: `T${index}`, createdAt: new Date(Date.UTC(2026, 0, 1 + index)) }),
    );
    expect(renderHtmlReport(analyze(tickets), 'Long', generatedAt)).toContain(
      'Showing the latest 90 days.',
    );
  });
});
