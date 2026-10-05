import { formatCsv } from '../import/csv.js';
import type { Analysis, PeriodStat } from '../stats/analyze.js';

type Cell = string | number | null;

function periodRows(section: string, stats: readonly PeriodStat[]): Cell[][] {
  return stats.flatMap((stat) => [
    [section, stat.period, 'created', stat.created],
    [section, stat.period, 'closed', stat.closed],
  ]);
}

export function renderAnalysisCsv(analysis: Analysis): string {
  const { totals, firstResponse, resolution } = analysis;
  const rows: Cell[][] = [
    ['section', 'key', 'metric', 'value'],
    ['summary', '', 'tickets', totals.tickets],
    ['summary', '', 'open', totals.open],
    ['summary', '', 'closed', totals.closed],
    ['summary', '', 'answered', firstResponse.answered],
    ['summary', '', 'unanswered', firstResponse.unanswered],
    ['summary', '', 'firstResponseAverageMs', firstResponse.averageMs],
    ['summary', '', 'firstResponseMedianMs', firstResponse.medianMs],
    ['summary', '', 'firstResponseP90Ms', firstResponse.p90Ms],
    ['summary', '', 'resolved', resolution.resolved],
    ['summary', '', 'resolutionAverageMs', resolution.averageMs],
    ...analysis.byStaff.flatMap((stat): Cell[][] => [
      ['staff', stat.staff, 'tickets', stat.tickets],
      ['staff', stat.staff, 'averageFirstResponseMs', stat.averageFirstResponseMs],
    ]),
    ...analysis.byCategory.map((stat): Cell[] => [
      'category',
      stat.category,
      'tickets',
      stat.tickets,
    ]),
    ...analysis.byHour.map((count, hour): Cell[] => [
      'hour',
      String(hour).padStart(2, '0'),
      'tickets',
      count,
    ]),
    ...periodRows('day', analysis.daily),
    ...periodRows('week', analysis.weekly),
    ...periodRows('month', analysis.monthly),
  ];
  return formatCsv(rows.map((row) => row.map((cell) => (cell === null ? '' : String(cell)))));
}
