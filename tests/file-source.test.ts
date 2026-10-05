import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OptionError, SourceError } from '../src/errors.js';
import { FileTicketSource } from '../src/sources/file.js';
import { TICKETS_JSON, workspace } from './helpers.js';

describe('FileTicketSource', () => {
  it('loads JSON and CSV files by extension', async () => {
    const directory = workspace({
      'tickets.json': TICKETS_JSON,
      'tickets.csv': 'id,createdAt,user,category,status\nC-1,2026-03-02T09:00:00Z,a,x,open\n',
      'messages.csv': 'ticketId,author,authorRole,timestamp\nC-1,a,user,2026-03-02T09:00:00Z\n',
    });
    expect(await new FileTicketSource({ path: `${directory}/tickets.json` }).load()).toHaveLength(
      2,
    );
    const csv = await new FileTicketSource({
      path: `${directory}/tickets.csv`,
      messagesPath: `${directory}/messages.csv`,
    }).load();
    expect(csv[0]?.messages).toHaveLength(1);
  });

  it('refuses files above the size limit, before parsing', async () => {
    const directory = workspace({ 'big.json': TICKETS_JSON });
    await expect(
      new FileTicketSource({ path: `${directory}/big.json`, maxBytes: 10 }).load(),
    ).rejects.toThrow('larger than the 10 bytes limit');
  });

  it('rejects invalid limits, unknown extensions, directories and missing files', async () => {
    const directory = workspace({ 'a.txt': 'x', 'a.json': '[]', 'folder.json/inner': 'x' });
    await expect(
      new FileTicketSource({ path: `${directory}/a.json`, maxBytes: 0 }).load(),
    ).rejects.toBeInstanceOf(OptionError);
    await expect(new FileTicketSource({ path: `${directory}/a.txt` }).load()).rejects.toThrow(
      'unsupported file type',
    );
    await expect(new FileTicketSource({ path: directory + '/x.json' }).load()).rejects.toThrow(
      SourceError,
    );
    await expect(new FileTicketSource({ path: `${directory}/folder.json` }).load()).rejects.toThrow(
      'not a regular file',
    );
    await expect(new FileTicketSource({ path: `${directory}/x.json` }).load()).rejects.toThrow(
      'cannot read',
    );
  });

  it('rejects files that are not valid UTF-8', async () => {
    const directory = workspace();
    writeFileSync(`${directory}/latin.json`, Buffer.from([0x5b, 0xff, 0xfe, 0x5d]));
    await expect(new FileTicketSource({ path: `${directory}/latin.json` }).load()).rejects.toThrow(
      'not valid UTF-8',
    );
  });

  it('rejects a messages file for JSON input', async () => {
    const directory = workspace({ 'a.json': '[]' });
    await expect(
      new FileTicketSource({
        path: `${directory}/a.json`,
        messagesPath: `${directory}/m.csv`,
      }).load(),
    ).rejects.toThrow('only supported for CSV');
  });
});
