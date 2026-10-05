import { describe, expect, it } from 'vitest';
import { BOM } from './helpers.js';
import { CsvSyntaxError, formatCsv, parseCsv } from '../src/import/csv.js';

function fields(text: string): string[][] {
  return parseCsv(text).map((record) => record.fields);
}

describe('parseCsv', () => {
  it('reads simple rows with LF and CRLF line endings', () => {
    expect(fields('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(fields('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('accepts a missing final newline and skips blank lines', () => {
    expect(fields('a\n\n\nb')).toEqual([['a'], ['b']]);
  });

  it('strips a leading byte order mark', () => {
    expect(
      fields(`${BOM}id,user
1,x`)[0],
    ).toEqual(['id', 'user']);
  });

  it('handles quoted fields with commas and doubled quotes', () => {
    expect(fields('"a,b","say ""hi"""\n')).toEqual([['a,b', 'say "hi"']]);
  });

  it('keeps line breaks inside quoted fields and reports the starting line of later records', () => {
    const records = parseCsv('id,note\n1,"line one\r\nline two"\n2,after\n');
    expect(records[1]?.fields).toEqual(['1', 'line one\r\nline two']);
    expect(records[2]?.line).toBe(4);
  });

  it('keeps empty fields, including trailing ones and quoted empty lines', () => {
    expect(fields('a,,c,\n"",x\n')).toEqual([
      ['a', '', 'c', ''],
      ['', 'x'],
    ]);
    expect(fields('""\n')).toEqual([['']]);
  });

  it('does not treat formulas or spaces specially while parsing', () => {
    expect(fields('=1+1, padded \n')).toEqual([['=1+1', ' padded ']]);
  });

  it('rejects an unterminated quote and reports where it started', () => {
    expect(() => parseCsv('a\n"open,field\nmore')).toThrow(CsvSyntaxError);
    try {
      parseCsv('a\n"open,field\nmore');
    } catch (error) {
      expect((error as CsvSyntaxError).line).toBe(2);
    }
  });

  it('rejects stray quotes and text after a closing quote', () => {
    expect(() => parseCsv('ab"c\n')).toThrow('unexpected quote');
    expect(() => parseCsv('"ab"c\n')).toThrow('after the closing quote');
  });

  it('parses a large file without quadratic behavior', () => {
    const row = 'T-1,2026-03-01T00:00:00Z,"a ""quoted"" value"\n';
    const records = parseCsv(row.repeat(50_000));
    expect(records).toHaveLength(50_000);
  });
});

describe('formatCsv', () => {
  it('quotes fields that need it and escapes quotes', () => {
    expect(formatCsv([['a,b', 'say "hi"', 'plain', 'two\nlines']])).toBe(
      '"a,b","say ""hi""",plain,"two\nlines"\n',
    );
  });

  it('neutralizes spreadsheet formula injection', () => {
    expect(formatCsv([['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)', 'ok']])).toBe(
      '"\'=HYPERLINK(""x"")",\'+1,\'-1,\'@SUM(A1),ok\n',
    );
  });

  it('round-trips through the parser', () => {
    const rows = [
      ['k', 'v'],
      ['a,b', 'x\r\ny'],
      ['q"uote', ''],
    ];
    expect(fields(formatCsv(rows))).toEqual(rows);
  });
});
