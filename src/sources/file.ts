import { extname } from 'node:path';
import { OptionError } from '../errors.js';
import { readBoundedText, resolveMaxBytes } from '../import/files.js';
import { parseTicketsJson } from '../import/json.js';
import { parseTicketsCsv } from '../import/ticket-csv.js';
import type { Ticket } from '../model.js';
import type { TicketSource } from './source.js';

export interface FileSourceOptions {
  path: string;
  messagesPath?: string;
  maxBytes?: number;
}

export class FileTicketSource implements TicketSource {
  private readonly options: FileSourceOptions;

  constructor(options: FileSourceOptions) {
    this.options = options;
  }

  async load(): Promise<Ticket[]> {
    const { path, messagesPath } = this.options;
    const maxBytes = resolveMaxBytes(this.options.maxBytes);
    const extension = extname(path).toLowerCase();

    if (extension === '.json') {
      if (messagesPath !== undefined) {
        throw new OptionError('a separate messages file is only supported for CSV tickets');
      }
      return parseTicketsJson(await readBoundedText(path, maxBytes), path);
    }
    if (extension === '.csv') {
      const ticketsText = await readBoundedText(path, maxBytes);
      const messagesText =
        messagesPath === undefined ? undefined : await readBoundedText(messagesPath, maxBytes);
      return parseTicketsCsv({
        ticketsText,
        ticketsLabel: path,
        messagesText,
        messagesLabel: messagesPath,
      });
    }
    throw new OptionError(`unsupported file type ${JSON.stringify(extension)}; use .json or .csv`);
  }
}
