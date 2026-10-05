import { readFile, stat } from 'node:fs/promises';
import { OptionError, SourceError } from '../errors.js';
import { BYTES_PER_MIB, LIMITS } from '../model.js';

export function resolveMaxBytes(maxBytes: number | undefined): number {
  const value = maxBytes ?? LIMITS.maxFileBytes;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OptionError('maximum file size must be a positive integer number of bytes');
  }
  return value;
}

function tooLarge(path: string, maxBytes: number): SourceError {
  const limit = maxBytes >= BYTES_PER_MIB ? `${maxBytes / BYTES_PER_MIB} MiB` : `${maxBytes} bytes`;
  return new SourceError(`${path} is larger than the ${limit} limit`);
}

export async function readBoundedText(path: string, maxBytes: number): Promise<string> {
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new SourceError(`${path} is not a regular file`);
    size = info.size;
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(
      `cannot read ${path}: ${(error as NodeJS.ErrnoException).code ?? 'unknown error'}`,
    );
  }
  if (size > maxBytes) throw tooLarge(path, maxBytes);

  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (error) {
    throw new SourceError(
      `cannot read ${path}: ${(error as NodeJS.ErrnoException).code ?? 'unknown error'}`,
    );
  }
  if (buffer.length > maxBytes) throw tooLarge(path, maxBytes);

  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new SourceError(`${path} is not valid UTF-8`);
  }
}
