import { readFileSync } from 'node:fs';
import { OptionError, SourceError, TicketDataError } from '../errors.js';
import { runAnalyze, runReport, runValidate } from './commands.js';
import type { CliIo } from './runtime.js';

const EXIT_INVALID_DATA = 1;
const EXIT_FAILURE = 2;

const HELP = `discord-ticket-analytics - analyze support ticket data

Usage:
  discord-ticket-analytics analyze  <tickets.json | tickets.csv> [-m <messages.csv>] [options] [--json | --csv]
  discord-ticket-analytics report   <tickets.json | tickets.csv> [-m <messages.csv>] -o <report.html> [--force] [--title <text>] [options]
  discord-ticket-analytics validate <tickets.json | tickets.csv> [-m <messages.csv>] [--max-bytes <n>]
  discord-ticket-analytics <command> --discord --category <id> --staff-role <id>... [options]

Commands:
  analyze    Print statistics as a table (default), JSON or CSV.
  report     Write a standalone HTML report (no external resources).
  validate   Check the input and print the ticket and message counts.

Input:
  -m, --messages <file>      Messages CSV that goes with a tickets CSV
      --max-bytes <n>        Largest input file accepted (default 52428800)

Discord source (needs the optional discord.js package):
      --discord              Read tickets from Discord instead of a file
      --category <id>        Category whose text channels are open tickets
      --closed-category <id> Category whose text channels are closed tickets
      --staff-role <id>      Role that marks staff (repeatable, at least one)
      --token-env <NAME>     Environment variable holding the bot token (default DISCORD_TOKEN)
      --max-channels <n>     Ticket channel limit (default 1000)
      --max-messages <n>     Messages per channel limit (default 10000)

Analysis:
  -z, --timezone <zone>      IANA time zone for hours and periods (default UTC)
      --from <date|time>     Only tickets created at or after this moment
      --to <date|time>       Only tickets created before this moment
      --peak-hours <n>       How many busiest hours to list (default 3)

Exit codes:
  0  success
  1  the ticket data is invalid
  2  usage, file or Discord error

Options:
  -h, --help                 Show this help
  -v, --version              Show the version
`;

function version(): string {
  const manifest = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}

async function dispatch(command: string, rest: string[], io: CliIo): Promise<number> {
  switch (command) {
    case 'analyze':
      return runAnalyze(rest, io);
    case 'report':
      return runReport(rest, io);
    case 'validate':
      return runValidate(rest, io);
    default:
      throw new OptionError(`unknown command ${JSON.stringify(command)}; run with --help`);
  }
}

export async function run(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined) {
    io.stderr.write(HELP);
    return EXIT_FAILURE;
  }
  if (command === '-v' || command === '--version') {
    io.stdout.write(`${version()}\n`);
    return 0;
  }
  if (
    ['-h', '--help', 'help'].includes(command) ||
    rest.includes('--help') ||
    rest.includes('-h')
  ) {
    io.stdout.write(HELP);
    return 0;
  }
  try {
    return await dispatch(command, rest, io);
  } catch (error) {
    if (error instanceof TicketDataError) {
      io.stderr.write(`Invalid ticket data:\n${error.message}\n`);
      return EXIT_INVALID_DATA;
    }
    if (error instanceof OptionError || error instanceof SourceError) {
      io.stderr.write(`Error: ${error.message}\n`);
      return EXIT_FAILURE;
    }
    io.stderr.write(`Unexpected error: ${error instanceof Error ? error.message : 'unknown'}\n`);
    return EXIT_FAILURE;
  }
}
