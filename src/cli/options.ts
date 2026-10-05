import { resolve } from 'node:path';
import { OptionError } from '../errors.js';
import { parseRangeBoundary } from '../timestamp.js';
import type { AnalyzeOptions } from '../stats/analyze.js';
import { DiscordTicketSource } from '../sources/discord.js';
import { FileTicketSource } from '../sources/file.js';
import type { TicketSource } from '../sources/source.js';
import type { CliIo } from './runtime.js';

export const DEFAULT_TOKEN_ENV = 'DISCORD_TOKEN';

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DIGITS = /^\d+$/;

export const SOURCE_OPTIONS = {
  messages: { type: 'string', short: 'm' },
  'max-bytes': { type: 'string' },
  discord: { type: 'boolean' },
  category: { type: 'string' },
  'closed-category': { type: 'string' },
  'staff-role': { type: 'string', multiple: true },
  'token-env': { type: 'string' },
  'max-channels': { type: 'string' },
  'max-messages': { type: 'string' },
} as const;

export const ANALYSIS_OPTIONS = {
  timezone: { type: 'string', short: 'z' },
  from: { type: 'string' },
  to: { type: 'string' },
  'peak-hours': { type: 'string' },
} as const;

export interface SourceValues {
  messages?: string;
  'max-bytes'?: string;
  discord?: boolean;
  category?: string;
  'closed-category'?: string;
  'staff-role'?: string[];
  'token-env'?: string;
  'max-channels'?: string;
  'max-messages'?: string;
}

export interface AnalysisValues {
  timezone?: string;
  from?: string;
  to?: string;
  'peak-hours'?: string;
}

function integerOption(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!DIGITS.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new OptionError(`--${name} must be a positive integer`);
  }
  return parsed;
}

function dateOption(name: string, value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = parseRangeBoundary(value);
  if (parsed === undefined) {
    throw new OptionError(
      `--${name} must be an ISO date (2026-03-01) or timestamp with a time zone`,
    );
  }
  return parsed;
}

export function analysisOptions(values: AnalysisValues): AnalyzeOptions {
  return {
    timeZone: values.timezone,
    from: dateOption('from', values.from),
    to: dateOption('to', values.to),
    peakHours: integerOption('peak-hours', values['peak-hours']),
  };
}

function readToken(values: SourceValues, io: CliIo): string {
  const name = values['token-env'] ?? DEFAULT_TOKEN_ENV;
  if (!ENV_NAME.test(name)) {
    throw new OptionError(
      '--token-env must be the NAME of an environment variable, never the token itself',
    );
  }
  const token = io.env[name];
  if (token === undefined || token === '') {
    throw new OptionError(`environment variable ${name} is not set`);
  }
  return token;
}

export function inputPaths(
  values: SourceValues,
  positionals: readonly string[],
  io: CliIo,
): string[] {
  return [...positionals, ...(values.messages === undefined ? [] : [values.messages])].map((path) =>
    resolve(io.cwd, path),
  );
}

export function buildSource(
  values: SourceValues,
  positionals: readonly string[],
  io: CliIo,
): TicketSource {
  const maxBytes = integerOption('max-bytes', values['max-bytes']);

  if (values.discord === true) {
    if (positionals.length > 0 || values.messages !== undefined) {
      throw new OptionError('--discord cannot be combined with input files');
    }
    if (values.category === undefined) throw new OptionError('--discord needs --category <id>');
    return new DiscordTicketSource({
      token: readToken(values, io),
      categoryId: values.category,
      closedCategoryId: values['closed-category'],
      staffRoleIds: values['staff-role'] ?? [],
      maxChannels: integerOption('max-channels', values['max-channels']),
      maxMessagesPerChannel: integerOption('max-messages', values['max-messages']),
      loadDiscord: io.loadDiscord,
    });
  }

  const [file, ...extra] = positionals;
  if (file === undefined || extra.length > 0) {
    throw new OptionError('expected exactly one tickets file (or use --discord)');
  }
  return new FileTicketSource({
    path: resolve(io.cwd, file),
    messagesPath: values.messages === undefined ? undefined : resolve(io.cwd, values.messages),
    maxBytes,
  });
}
