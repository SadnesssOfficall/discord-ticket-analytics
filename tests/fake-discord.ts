import {
  type DiscordChannelLike,
  type DiscordClientLike,
  type DiscordMessageLike,
  type DiscordModule,
} from '../src/sources/discord-module.js';
import type { DiscordSourceOptions } from '../src/sources/discord.js';

export const TOKEN = 'FAKE.TOKEN.never-printed';
export const CATEGORY = '100000000000000001';
export const CLOSED_CATEGORY = '100000000000000002';
export const STAFF_ROLE = '300000000000000001';
export const STAFF_ID = '200000000000000001';
export const USER_ID = '200000000000000002';
export const BOT_ID = '200000000000000003';
export const GUILD_TEXT = 0;
export const GUILD_CATEGORY = 4;
export const BASE_TIME = Date.UTC(2026, 2, 2, 9, 0, 0);
export const MINUTE = 60_000;

export const people: Record<string, { username: string; bot: boolean }> = {
  [STAFF_ID]: { username: 'alice', bot: false },
  [USER_ID]: { username: 'carol', bot: false },
  [BOT_ID]: { username: 'ticketbot', bot: true },
};

export function discordMessage(id: number, minutes: number, authorId: string): DiscordMessageLike {
  const person = people[authorId] ?? { username: 'ghost', bot: false };
  return {
    id: `4${String(id).padStart(17, '0')}`,
    createdTimestamp: BASE_TIME + minutes * MINUTE,
    author: { id: authorId, username: person.username, bot: person.bot },
  };
}

export interface FakeState {
  loggedIn: string[];
  destroyed: number;
  fetchCalls: number;
  memberFetches: string[];
  pageSizes: number[];
}

export function channel(
  id: string,
  parentId: string,
  messages: DiscordMessageLike[],
  state: FakeState,
): DiscordChannelLike {
  return {
    id,
    type: GUILD_TEXT,
    parentId,
    createdTimestamp: BASE_TIME,
    messages: {
      fetch: ({ limit, before }) => {
        state.fetchCalls++;
        state.pageSizes.push(limit);
        const sorted = messages.toSorted((left, right) =>
          BigInt(left.id) > BigInt(right.id) ? -1 : 1,
        );
        const start =
          before === undefined ? 0 : sorted.findIndex((entry) => entry.id === before) + 1;
        return Promise.resolve(
          new Map(sorted.slice(start, start + limit).map((entry) => [entry.id, entry])),
        );
      },
    },
  };
}

export function fakeModule(
  channels: (state: FakeState) => DiscordChannelLike[],
  failLogin?: Error,
): { module: DiscordModule; state: FakeState } {
  const state: FakeState = {
    loggedIn: [],
    destroyed: 0,
    fetchCalls: 0,
    memberFetches: [],
    pageSizes: [],
  };
  const built = channels(state);
  const guild = {
    channels: { fetch: () => Promise.resolve(new Map(built.map((entry) => [entry.id, entry]))) },
    members: {
      fetch: (userId: string) => {
        state.memberFetches.push(userId);
        if (userId === 'unknown')
          return Promise.reject(Object.assign(new Error('x'), { code: 10007 }));
        return Promise.resolve({
          roles: { cache: { has: (role: string) => userId === STAFF_ID && role === STAFF_ROLE } },
        });
      },
    },
  };
  const categories: Record<string, string> = {
    [CATEGORY]: 'Billing',
    [CLOSED_CATEGORY]: 'Billing',
  };
  class FakeClient implements DiscordClientLike {
    channels = {
      fetch: (id: string) => {
        const name = categories[id];
        if (name === undefined) return Promise.resolve(null);
        return Promise.resolve({ id, name, type: GUILD_CATEGORY, guild });
      },
    };
    login(token: string): Promise<unknown> {
      state.loggedIn.push(token);
      return failLogin === undefined ? Promise.resolve('ok') : Promise.reject(failLogin);
    }
    destroy(): Promise<void> {
      state.destroyed++;
      return Promise.resolve();
    }
  }
  return {
    state,
    module: {
      Client: FakeClient,
      GatewayIntentBits: { Guilds: 1 },
      ChannelType: { GuildCategory: GUILD_CATEGORY, GuildText: GUILD_TEXT },
    },
  };
}

export function options(
  module: DiscordModule,
  extra: Partial<DiscordSourceOptions> = {},
): DiscordSourceOptions {
  return {
    token: TOKEN,
    categoryId: CATEGORY,
    staffRoleIds: [STAFF_ROLE],
    loadDiscord: () => Promise.resolve(module),
    ...extra,
  };
}

export const openChannel = (state: FakeState) =>
  channel(
    '500000000000000001',
    CATEGORY,
    [
      discordMessage(1, 0, USER_ID),
      discordMessage(2, 1, BOT_ID),
      discordMessage(3, 15, STAFF_ID),
      discordMessage(4, 20, USER_ID),
    ],
    state,
  );
