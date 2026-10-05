import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OptionError } from '../errors.js';
import { renderAnalysisCsv } from '../output/csv.js';
import { DEFAULT_REPORT_TITLE, renderHtmlReport } from '../output/html.js';
import { renderAnalysisTable } from '../output/table.js';
import { analyze } from '../stats/analyze.js';
import {
  analysisOptions,
  ANALYSIS_OPTIONS,
  buildSource,
  inputPaths,
  SOURCE_OPTIONS,
} from './options.js';
import { parseOptions, type CliIo } from './runtime.js';

const MAX_TITLE_LENGTH = 200;

const ANALYZE_OPTIONS = {
  ...SOURCE_OPTIONS,
  ...ANALYSIS_OPTIONS,
  json: { type: 'boolean' },
  csv: { type: 'boolean' },
} as const;

const REPORT_OPTIONS = {
  ...SOURCE_OPTIONS,
  ...ANALYSIS_OPTIONS,
  output: { type: 'string', short: 'o' },
  force: { type: 'boolean' },
  title: { type: 'string' },
} as const;

export async function runAnalyze(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseOptions(args, ANALYZE_OPTIONS);
  if (values.json === true && values.csv === true) {
    throw new OptionError('--json and --csv cannot be combined');
  }
  const tickets = await buildSource(values, positionals, io).load();
  const analysis = analyze(tickets, analysisOptions(values));

  if (values.json === true) io.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
  else if (values.csv === true) io.stdout.write(renderAnalysisCsv(analysis));
  else io.stdout.write(renderAnalysisTable(analysis));
  return 0;
}

export async function runValidate(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseOptions(args, SOURCE_OPTIONS);
  const tickets = await buildSource(values, positionals, io).load();
  const messages = tickets.reduce((sum, ticket) => sum + ticket.messages.length, 0);
  io.stdout.write(`OK: ${tickets.length} tickets, ${messages} messages\n`);
  return 0;
}

export async function runReport(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseOptions(args, REPORT_OPTIONS);
  if (values.output === undefined) throw new OptionError('report needs --output <file.html>');
  const title = values.title ?? DEFAULT_REPORT_TITLE;
  if (title.length > MAX_TITLE_LENGTH) {
    throw new OptionError(`--title is longer than ${MAX_TITLE_LENGTH} characters`);
  }
  const output = resolve(io.cwd, values.output);
  if (inputPaths(values, positionals, io).includes(output)) {
    throw new OptionError('--output must not be one of the input files');
  }

  const tickets = await buildSource(values, positionals, io).load();
  const html = renderHtmlReport(analyze(tickets, analysisOptions(values)), title);
  try {
    await writeFile(output, html, { flag: values.force === true ? 'w' : 'wx' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw new OptionError(`${values.output} already exists; use --force`);
    throw new OptionError(`cannot write ${values.output}: ${code ?? 'unknown error'}`);
  }
  io.stdout.write(`Wrote ${values.output}\n`);
  return 0;
}
