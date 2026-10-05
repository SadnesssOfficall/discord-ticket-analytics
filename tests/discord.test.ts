import { describe, expect, it } from 'vitest';
import { OptionError, SourceError } from '../src/errors.js';
import { DiscordTicketSource } from '../src/sources/discord.js';
import { importDiscord } from '../src/sources/discord-module.js';
import { analyze } from '../src/stats/analyze.js';
import {
  CATEGORY,
  CLOSED_CATEGORY,
  MINUTE,
  BASE_TIME,
  STAFF_ID,
  TOKEN,
  USER_ID,
  channel,
  discordMessage,
  fakeModule,
  openChannel,
  options,
} from './fake-discord.js';

describe('DiscordTicketSource (fake discord.js client, not the real API)', () => {
  it('turns category channels into tickets with roles derived from guild roles', async () => {
    const { module, state } = fakeModule((s) => [openChannel(s)]);
    const tickets = await new DiscordTicketSource(options(module)).load();

    expect(tickets).toHaveLength(1);
    const [only] = tickets;
    expect(only?.id).toBe('500000000000000001');
    expect(only?.status).toBe('open');
    expect(only?.category).toBe('Billing');
    expect(only?.user).toBe('carol');
    expect(only?.staff).toBe('alice');
    expect(only?.messages.map((entry) => entry.authorRole)).toEqual([
      'user',
      'bot',
      'staff',
      'user',
    ]);
    expect(only?.messages.map((entry) => entry.timestamp.getTime())).toEqual(
      [0, 1, 15, 20].map((m) => BASE_TIME + m * MINUTE),
    );
    expect(state.loggedIn).toEqual([TOKEN]);
    expect(state.destroyed).toBe(1);
    expect(analyze(tickets).firstResponse.averageMs).toBe(15 * MINUTE);
  });

  it('looks up each member once and never for bots', async () => {
    const { module, state } = fakeModule((s) => [openChannel(s)]);
    await new DiscordTicketSource(options(module)).load();
    expect(state.memberFetches.toSorted()).toEqual([STAFF_ID, USER_ID].toSorted());
  });

  it('pages through long channels with the before cursor and a page size of 100', async () => {
    const many = Array.from({ length: 250 }, (_, index) =>
      discordMessage(index + 1, index, USER_ID),
    );
    const { module, state } = fakeModule((s) => [channel('500000000000000002', CATEGORY, many, s)]);
    const [ticketFound] = await new DiscordTicketSource(options(module)).load();
    expect(ticketFound?.messages).toHaveLength(250);
    expect(state.fetchCalls).toBe(3);
    expect(new Set(state.pageSizes)).toEqual(new Set([100]));
  });

  it('marks channels from the closed category as closed using the last message time', async () => {
    const { module } = fakeModule((s) => [
      channel(
        '500000000000000003',
        CLOSED_CATEGORY,
        [discordMessage(1, 0, USER_ID), discordMessage(2, 30, STAFF_ID)],
        s,
      ),
    ]);
    const [closed] = await new DiscordTicketSource(
      options(module, { closedCategoryId: CLOSED_CATEGORY }),
    ).load();
    expect(closed?.status).toBe('closed');
    expect(closed?.closedAt?.getTime()).toBe(BASE_TIME + 30 * MINUTE);
  });

  it('ignores channels of other categories and non-text channels', async () => {
    const { module } = fakeModule((s) => [
      openChannel(s),
      channel('500000000000000009', '100000000000000099', [discordMessage(1, 0, USER_ID)], s),
      { ...channel('500000000000000010', CATEGORY, [], s), type: 2 },
    ]);
    expect(await new DiscordTicketSource(options(module)).load()).toHaveLength(1);
  });

  it('enforces the message limit instead of fetching without bound', async () => {
    const many = Array.from({ length: 150 }, (_, index) =>
      discordMessage(index + 1, index, USER_ID),
    );
    const { module } = fakeModule((s) => [channel('500000000000000002', CATEGORY, many, s)]);
    await expect(
      new DiscordTicketSource(options(module, { maxMessagesPerChannel: 120 })).load(),
    ).rejects.toThrow('more than 120 messages');
  });

  it('enforces the channel limit', async () => {
    const { module } = fakeModule((s) => [
      openChannel(s),
      channel('500000000000000004', CATEGORY, [discordMessage(9, 0, USER_ID)], s),
    ]);
    await expect(
      new DiscordTicketSource(options(module, { maxChannels: 1 })).load(),
    ).rejects.toThrow('more than 1 ticket channels');
  });

  it('fails clearly when the category does not exist', async () => {
    const { module, state } = fakeModule(() => []);
    await expect(
      new DiscordTicketSource(options(module, { categoryId: '100000000000000777' })).load(),
    ).rejects.toThrow('not found or is not a category');
    expect(state.destroyed).toBe(1);
  });

  it('never leaks the token in errors from the client', async () => {
    const { module, state } = fakeModule(() => [], new Error(`401 Unauthorized for ${TOKEN}`));
    const failure = await new DiscordTicketSource(options(module))
      .load()
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SourceError);
    expect((failure as Error).message).not.toContain(TOKEN);
    expect((failure as Error).message).toContain('[redacted]');
    expect(state.destroyed).toBe(1);
  });

  it('validates options before touching the network', () => {
    const { module } = fakeModule(() => []);
    expect(() => new DiscordTicketSource(options(module, { token: ' ' }))).toThrow(OptionError);
    expect(() => new DiscordTicketSource(options(module, { categoryId: 'general' }))).toThrow(
      'Discord ID',
    );
    expect(() => new DiscordTicketSource(options(module, { staffRoleIds: [] }))).toThrow(
      'staff role',
    );
    expect(() => new DiscordTicketSource(options(module, { staffRoleIds: ['abc'] }))).toThrow(
      'Discord ID',
    );
    expect(() => new DiscordTicketSource(options(module, { maxChannels: 0 }))).toThrow(
      'positive integer',
    );
  });

  it('sanitizes control characters in usernames', async () => {
    const hostile = {
      ...discordMessage(1, 0, USER_ID),
      author: { id: USER_ID, username: 'evil\u001b[31m', bot: false },
    };
    const { module } = fakeModule((s) => [channel('500000000000000005', CATEGORY, [hostile], s)]);
    const [found] = await new DiscordTicketSource(options(module)).load();
    expect(found?.user).toBe('evil?[31m');
  });
});

describe('importDiscord', () => {
  it('gives a clear error or a usable module depending on whether discord.js is installed', async () => {
    const outcome = await importDiscord().catch((error: unknown) => error as Error);
    if (outcome instanceof Error) {
      expect(outcome).toBeInstanceOf(SourceError);
      expect(outcome.message).toContain('npm install discord.js');
    } else {
      expect(typeof outcome.Client).toBe('function');
    }
  });
});
