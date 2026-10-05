import type { Analysis, PeriodStat } from '../stats/analyze.js';
import { formatDuration, formatHour } from './format.js';

const COLUMN_GAP = '  ';

export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  rightAlignFrom = 1,
): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => {
        const width = widths[column] ?? 0;
        return column >= rightAlignFrom ? cell.padStart(width) : cell.padEnd(width);
      })
      .join(COLUMN_GAP)
      .trimEnd();
  const rule = widths.map((width) => '-'.repeat(width)).join(COLUMN_GAP);
  return [line(headers), rule, ...rows.map(line)].join('\n');
}

function section(title: string, body: string): string {
  return `${title}\n${body}`;
}

function periodTable(title: string, stats: readonly PeriodStat[]): string {
  const rows = stats.map((stat) => [stat.period, String(stat.created), String(stat.closed)]);
  return section(title, renderTable(['Period', 'Created', 'Closed'], rows));
}

export function renderAnalysisTable(analysis: Analysis): string {
  const { totals, firstResponse, resolution } = analysis;
  const range = `${analysis.range.from ?? 'beginning'} to ${analysis.range.to ?? 'now'}`;
  const summary = renderTable(
    ['Metric', 'Value'],
    [
      ['Tickets', String(totals.tickets)],
      ['Open', String(totals.open)],
      ['Closed', String(totals.closed)],
      ['Answered by staff', String(firstResponse.answered)],
      ['Without staff response', String(firstResponse.unanswered)],
      ['First response, average', formatDuration(firstResponse.averageMs)],
      ['First response, median', formatDuration(firstResponse.medianMs)],
      ['First response, p90', formatDuration(firstResponse.p90Ms)],
      ['Resolved tickets', String(resolution.resolved)],
      ['Resolution time, average', formatDuration(resolution.averageMs)],
    ],
  );

  const sections = [
    `Time zone: ${analysis.timeZone}\nCreated: ${range}`,
    section('Summary', summary),
    section(
      'Tickets per staff member',
      renderTable(
        ['Staff', 'Tickets', 'Avg first response'],
        analysis.byStaff.map((stat) => [
          stat.staff,
          String(stat.tickets),
          formatDuration(stat.averageFirstResponseMs),
        ]),
      ),
    ),
    section(
      'Tickets per category',
      renderTable(
        ['Category', 'Tickets'],
        analysis.byCategory.map((stat) => [stat.category, String(stat.tickets)]),
      ),
    ),
    section(
      'Busiest hours',
      renderTable(
        ['Hour', 'Tickets'],
        analysis.peakHours.map((stat) => [formatHour(stat.hour), String(stat.tickets)]),
      ),
    ),
    periodTable('Daily', analysis.daily),
    periodTable('Weekly (ISO weeks)', analysis.weekly),
    periodTable('Monthly', analysis.monthly),
  ];
  return `${sections.join('\n\n')}\n`;
}
