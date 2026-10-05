import { describe, expect, it } from 'vitest';
import { DiscordTicketSource } from '../src/sources/discord.js';
import { cli } from './helpers.js';
import { CATEGORY, STAFF_ROLE, TOKEN, fakeModule, openChannel } from './fake-discord.js';

describe('CLI Discord wiring', () => {
  it('reads the token only from the named environment variable', async () => {
    const { module, state } = fakeModule((s) => [openChannel(s)]);
    const result = await cli(
      ['analyze', '--discord', '--category', CATEGORY, '--staff-role', STAFF_ROLE, '--json'],
      '.',
      { DISCORD_TOKEN: TOKEN },
      { loadDiscord: () => Promise.resolve(module) },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain(TOKEN);
    expect(result.stderr).not.toContain(TOKEN);
    expect(state.loggedIn).toEqual([TOKEN]);
  });

  it('refuses a token passed in place of a variable name and a missing variable', async () => {
    const pasted = await cli(
      [
        'analyze',
        '--discord',
        '--category',
        CATEGORY,
        '--staff-role',
        STAFF_ROLE,
        '--token-env',
        TOKEN,
      ],
      '.',
      {},
    );
    expect(pasted.code).toBe(2);
    expect(pasted.stderr).toContain('NAME of an environment variable');
    expect(pasted.stderr).not.toContain(TOKEN);
    const missing = await cli(
      ['analyze', '--discord', '--category', CATEGORY, '--staff-role', STAFF_ROLE],
      '.',
      {},
    );
    expect(missing.stderr).toContain('DISCORD_TOKEN is not set');
  });
});

const liveToken = process.env['DISCORD_TOKEN'];
const liveCategory = process.env['DISCORD_TEST_CATEGORY_ID'];
const liveRole = process.env['DISCORD_TEST_STAFF_ROLE_ID'];

describe.skipIf(!liveToken || !liveCategory || !liveRole)('live Discord API', () => {
  it('loads tickets from a real category', async () => {
    const source = new DiscordTicketSource({
      token: liveToken ?? '',
      categoryId: liveCategory ?? '',
      staffRoleIds: [liveRole ?? ''],
    });
    expect(Array.isArray(await source.load())).toBe(true);
  }, 120_000);
});
