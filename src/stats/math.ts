const PERCENT = 100;
const P90 = 90;

export interface Summary {
  average: number | null;
  median: number | null;
  p90: number | null;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: readonly number[], percent: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((percent * sorted.length) / PERCENT));
  return sorted[rank - 1] ?? null;
}

function median(sorted: readonly number[]): number | null {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  const lower = sorted[sorted.length % 2 === 0 ? middle - 1 : middle];
  if (upper === undefined || lower === undefined) return null;
  return (lower + upper) / 2;
}

export function summarize(values: readonly number[]): Summary {
  const sorted = values.toSorted((left, right) => left - right);
  return { average: mean(sorted), median: median(sorted), p90: percentile(sorted, P90) };
}
