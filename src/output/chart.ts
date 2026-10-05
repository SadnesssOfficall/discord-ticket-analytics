export interface ChartItem {
  label: string;
  value: number;
}

const COLUMN = { width: 720, height: 220, left: 36, right: 8, top: 16, bottom: 28 } as const;
const BAR = {
  rowHeight: 28,
  labelWidth: 190,
  valueWidth: 64,
  width: 720,
  maxLabelChars: 26,
} as const;
const MAX_X_LABELS = 12;
const BAR_THICKNESS_RATIO = 0.64;
const COLUMN_GAP_RATIO = 0.2;
const DECIMALS = 2;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function num(value: number): string {
  return String(Number(value.toFixed(DECIMALS)));
}

function truncate(label: string): string {
  const characters = Array.from(label);
  if (characters.length <= BAR.maxLabelChars) return label;
  return `${characters.slice(0, BAR.maxLabelChars - 1).join('')}…`;
}

const EMPTY_CHART = '<p class="empty">No data in this range.</p>';

export function columnChart(items: readonly ChartItem[], description: string): string {
  if (items.length === 0) return EMPTY_CHART;
  const plotWidth = COLUMN.width - COLUMN.left - COLUMN.right;
  const plotHeight = COLUMN.height - COLUMN.top - COLUMN.bottom;
  const baseline = COLUMN.top + plotHeight;
  const slot = plotWidth / items.length;
  const gap = slot * COLUMN_GAP_RATIO;
  const max = Math.max(1, ...items.map((item) => item.value));
  const labelStep = Math.ceil(items.length / MAX_X_LABELS);

  const bars = items.map((item, index) => {
    const height = (item.value / max) * plotHeight;
    const x = COLUMN.left + index * slot + gap / 2;
    const tip = `<title>${escapeHtml(item.label)}: ${item.value}</title>`;
    return `<rect class="bar" x="${num(x)}" y="${num(baseline - height)}" width="${num(slot - gap)}" height="${num(height)}">${tip}</rect>`;
  });
  const labels = items.flatMap((item, index) =>
    index % labelStep === 0
      ? `<text class="axis" x="${num(COLUMN.left + index * slot + slot / 2)}" y="${COLUMN.height - 8}" text-anchor="middle">${escapeHtml(item.label)}</text>`
      : [],
  );

  return [
    `<svg class="chart" viewBox="0 0 ${COLUMN.width} ${COLUMN.height}" role="img" aria-label="${escapeHtml(description)}">`,
    `<line class="rule" x1="${COLUMN.left}" y1="${baseline}" x2="${COLUMN.width - COLUMN.right}" y2="${baseline}"/>`,
    `<text class="axis" x="${COLUMN.left - 6}" y="${COLUMN.top + 4}" text-anchor="end">${max}</text>`,
    `<text class="axis" x="${COLUMN.left - 6}" y="${baseline}" text-anchor="end">0</text>`,
    ...bars,
    ...labels,
    '</svg>',
  ].join('');
}

export function barChart(items: readonly ChartItem[], description: string): string {
  if (items.length === 0) return EMPTY_CHART;
  const height = items.length * BAR.rowHeight;
  const maxBar = BAR.width - BAR.labelWidth - BAR.valueWidth;
  const max = Math.max(1, ...items.map((item) => item.value));
  const thickness = BAR.rowHeight * BAR_THICKNESS_RATIO;

  const rows = items.map((item, index) => {
    const top = index * BAR.rowHeight;
    const middle = top + BAR.rowHeight / 2;
    const width = (item.value / max) * maxBar;
    return [
      `<text class="axis" x="${BAR.labelWidth - 8}" y="${num(middle + 4)}" text-anchor="end">${escapeHtml(truncate(item.label))}<title>${escapeHtml(item.label)}</title></text>`,
      `<rect class="bar" x="${BAR.labelWidth}" y="${num(middle - thickness / 2)}" width="${num(width)}" height="${num(thickness)}"/>`,
      `<text class="axis" x="${num(BAR.labelWidth + width + 6)}" y="${num(middle + 4)}">${item.value}</text>`,
    ].join('');
  });

  return [
    `<svg class="chart" viewBox="0 0 ${BAR.width} ${height}" role="img" aria-label="${escapeHtml(description)}">`,
    ...rows,
    '</svg>',
  ].join('');
}
