import { parseArgs, type ParseArgsConfig } from 'node:util';
import { OptionError } from '../errors.js';
import type { DiscordModule } from '../sources/discord-module.js';

export interface CliIo {
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  loadDiscord?: () => Promise<DiscordModule>;
}

export function parseOptions<const Options extends NonNullable<ParseArgsConfig['options']>>(
  args: string[],
  options: Options,
) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (code.startsWith('ERR_PARSE_ARGS')) throw new OptionError((error as Error).message);
    throw error;
  }
}
