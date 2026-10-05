import { createHash } from 'node:crypto';
import type { Analysis, PeriodStat } from '../stats/analyze.js';
import { barChart, columnChart, escapeHtml, type ChartItem } from './chart.js';
import { formatDuration } from './format.js';

export const DEFAULT_REPORT_TITLE = 'Ticket analytics';

const MAX_CHART_ROWS = 15;
const MAX_DAILY_COLUMNS = 90;

const STYLE = `
:root{--bg:#ffffff;--fg:#1c2230;--muted:#566075;--card:#f3f5f9;--line:#d9dee8;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e6e9f0;--muted:#a0a9bb;--card:#1b2030;--line:#2b3246;--accent:#7c9cff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:56rem;margin:0 auto;padding:2rem 1rem 4rem}
h1{margin:0 0 .25rem;font-size:1.75rem}
h2{margin:2.5rem 0 .75rem;font-size:1.2rem}
.meta{margin:0;color:var(--muted);font-size:.9rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.75rem;margin-top:1.5rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:.5rem;padding:.75rem 1rem}
.card .label{display:block;color:var(--muted);font-size:.8rem}
.card .value{display:block;font-size:1.35rem;font-weight:600;font-variant-numeric:tabular-nums}
.chart{width:100%;height:auto;display:block}
.bar{fill:var(--accent)}
.axis{fill:var(--muted);font-size:11px}
.rule{stroke:var(--line);stroke-width:1}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:.4rem .6rem;border-bottom:1px solid var(--line);text-align:right}
th:first-child,td:first-child{text-align:left}
th{color:var(--muted);font-weight:600;font-size:.85rem}
.empty{color:var(--muted)}
`;

const STYLE_HASH = createHash('sha256').update(STYLE).digest('base64');

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return '<p class="empty">No data in this range.</p>';
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function periodTable(stats: readonly PeriodStat[]): string {
  return table(
    ['Period', 'Created', 'Closed'],
    stats.map((stat) => [stat.period, String(stat.created), String(stat.closed)]),
  );
}

function card(label: string, value: string): string {
  return `<div class="card"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

function section(heading: string, content: string): string {
  return `<section><h2>${escapeHtml(heading)}</h2>${content}</section>`;
}

export function renderHtmlReport(
  analysis: Analysis,
  title = DEFAULT_REPORT_TITLE,
  generatedAt = new Date(),
): string {
  const { totals, firstResponse, resolution } = analysis;
  const range = `${analysis.range.from ?? 'beginning'} to ${analysis.range.to ?? 'now'}`;

  const hours: ChartItem[] = analysis.byHour.map((value, hour) => ({
    label: String(hour).padStart(2, '0'),
    value,
  }));
  const days: ChartItem[] = analysis.daily
    .slice(-MAX_DAILY_COLUMNS)
    .map((stat) => ({ label: stat.period, value: stat.created }));
  const staff: ChartItem[] = analysis.byStaff
    .slice(0, MAX_CHART_ROWS)
    .map((stat) => ({ label: stat.staff, value: stat.tickets }));
  const categories: ChartItem[] = analysis.byCategory
    .slice(0, MAX_CHART_ROWS)
    .map((stat) => ({ label: stat.category, value: stat.tickets }));

  const cards = [
    card('Tickets', String(totals.tickets)),
    card('Open', String(totals.open)),
    card('Closed', String(totals.closed)),
    card('Without staff response', String(firstResponse.unanswered)),
    card('First response, average', formatDuration(firstResponse.averageMs)),
    card('First response, median', formatDuration(firstResponse.medianMs)),
    card('First response, p90', formatDuration(firstResponse.p90Ms)),
    card('Resolution, average', formatDuration(resolution.averageMs)),
  ].join('');

  const body = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="meta">Created ${escapeHtml(range)} &middot; time zone ${escapeHtml(analysis.timeZone)} &middot; generated ${escapeHtml(generatedAt.toISOString())}</p>`,
    `<div class="cards">${cards}</div>`,
    section(
      `Tickets created per hour of day (${analysis.timeZone})`,
      columnChart(hours, 'Tickets created per hour of day'),
    ),
    section(
      'Tickets created per day',
      columnChart(days, 'Tickets created per day') +
        (analysis.daily.length > MAX_DAILY_COLUMNS
          ? `<p class="meta">Showing the latest ${MAX_DAILY_COLUMNS} days.</p>`
          : ''),
    ),
    section('Tickets per staff member', barChart(staff, 'Tickets per staff member')),
    section(
      'Staff response times',
      table(
        ['Staff', 'Tickets', 'Avg first response'],
        analysis.byStaff.map((stat) => [
          stat.staff,
          String(stat.tickets),
          formatDuration(stat.averageFirstResponseMs),
        ]),
      ),
    ),
    section('Tickets per category', barChart(categories, 'Tickets per category')),
    section('Weekly (ISO weeks)', periodTable(analysis.weekly)),
    section('Monthly', periodTable(analysis.monthly)),
  ].join('\n');

  const policy = `default-src 'none'; style-src 'sha256-${STYLE_HASH}'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}
