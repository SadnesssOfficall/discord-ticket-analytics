export const BOM = String.fromCharCode(0xfeff);
const QUOTE = '"';
const DELIMITER = ',';
const LINE_FEED = '\n';
const CARRIAGE_RETURN = '\r';
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', CARRIAGE_RETURN];

export interface CsvRecord {
  line: number;
  fields: string[];
}

export class CsvSyntaxError extends Error {
  override name = 'CsvSyntaxError';
  readonly line: number;

  constructor(line: number, message: string) {
    super(message);
    this.line = line;
  }
}

export function parseCsv(input: string): CsvRecord[] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endField = (): void => {
    fields.push(field);
    field = '';
    closedQuote = false;
  };

  const endRecord = (): void => {
    const blank = fields.length === 0 && field === '' && !closedQuote;
    if (!blank) {
      endField();
      records.push({ line: recordLine, fields });
    }
    fields = [];
    field = '';
    closedQuote = false;
  };

  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);

    if (inQuotes) {
      if (char === QUOTE && next === QUOTE) {
        field += QUOTE;
        index++;
      } else if (char === QUOTE) {
        inQuotes = false;
        closedQuote = true;
      } else if (char === CARRIAGE_RETURN && next === LINE_FEED) {
        field += char + next;
        index++;
        line++;
      } else {
        field += char;
        if (char === LINE_FEED || char === CARRIAGE_RETURN) line++;
      }
    } else if (char === QUOTE) {
      if (field !== '' || closedQuote) {
        throw new CsvSyntaxError(line, 'unexpected quote inside an unquoted field');
      }
      inQuotes = true;
      quoteLine = line;
    } else if (char === DELIMITER) {
      endField();
    } else if (char === CARRIAGE_RETURN || char === LINE_FEED) {
      if (char === CARRIAGE_RETURN && next === LINE_FEED) index++;
      endRecord();
      line++;
      recordLine = line;
    } else if (closedQuote) {
      throw new CsvSyntaxError(line, 'unexpected character after the closing quote');
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new CsvSyntaxError(quoteLine, 'quoted field is never closed');
  endRecord();
  return records;
}

function formatCell(cell: string): string {
  const guarded = FORMULA_PREFIXES.some((prefix) => cell.startsWith(prefix)) ? `'${cell}` : cell;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll(QUOTE, '""')}"` : guarded;
}

export function formatCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(formatCell).join(DELIMITER)).join(LINE_FEED) + LINE_FEED;
}
