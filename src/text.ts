const HEX = 16;
const UNSAFE_CODE_POINTS = [0x2028, 0x2029, 0x200e, 0x200f, 0x061c];
const UNSAFE_RANGES: readonly (readonly [number, number])[] = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

function escapeCodePoint(codePoint: number): string {
  return `\\u{${codePoint.toString(HEX)}}`;
}

const UNSAFE_PATTERN = [
  String.raw`\p{Cc}`,
  ...UNSAFE_CODE_POINTS.map(escapeCodePoint),
  ...UNSAFE_RANGES.map(([from, to]) => `${escapeCodePoint(from)}-${escapeCodePoint(to)}`),
].join('');

const UNSAFE_TEXT = new RegExp(`[${UNSAFE_PATTERN}]`, 'u');
const UNSAFE_TEXT_GLOBAL = new RegExp(`[${UNSAFE_PATTERN}]`, 'gu');

export function hasUnsafeCharacters(value: string): boolean {
  return UNSAFE_TEXT.test(value);
}

export function replaceUnsafeCharacters(value: string): string {
  return value.replace(UNSAFE_TEXT_GLOBAL, '?');
}
