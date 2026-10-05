import { SourceError } from '../errors.js';

export interface DiscordUserLike {
  id: string;
  username: string;
  bot: boolean;
}

export interface DiscordMessageLike {
  id: string;
  createdTimestamp: number;
  author: DiscordUserLike;
}

export interface DiscordChannelLike {
  id: string;
  type: number;
  parentId: string | null;
  createdTimestamp: number | null;
  messages: {
    fetch(options: {
      limit: number;
      before?: string;
    }): Promise<ReadonlyMap<string, DiscordMessageLike>>;
  };
}

export interface DiscordGuildLike {
  channels: { fetch(): Promise<ReadonlyMap<string, DiscordChannelLike | null>> };
  members: {
    fetch(userId: string): Promise<{ roles: { cache: { has(roleId: string): boolean } } }>;
  };
}

export interface DiscordCategoryLike {
  id: string;
  name: string;
  type: number;
  guild: DiscordGuildLike;
}

export interface DiscordClientLike {
  login(token: string): Promise<unknown>;
  destroy(): Promise<void>;
  channels: { fetch(id: string): Promise<DiscordCategoryLike | null> };
}

export interface DiscordModule {
  Client: new (options: { intents: number[] }) => DiscordClientLike;
  GatewayIntentBits: { Guilds: number };
  ChannelType: { GuildCategory: number; GuildText: number };
}

const NOT_FOUND_MESSAGE = /cannot find|could not resolve|failed to resolve|failed to load/i;

function isModuleNotFound(error: unknown): boolean {
  if (!(error instanceof Error) || !error.message.includes('discord.js')) return false;
  return (
    (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
    NOT_FOUND_MESSAGE.test(error.message)
  );
}

function isDiscordModule(value: unknown): value is DiscordModule {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof DiscordModule, unknown>>;
  return (
    typeof candidate.Client === 'function' &&
    typeof candidate.GatewayIntentBits === 'object' &&
    typeof candidate.ChannelType === 'object'
  );
}

export async function importDiscord(): Promise<DiscordModule> {
  const specifier = 'discord.js';
  let loaded: unknown;
  try {
    loaded = await import(specifier);
  } catch (error) {
    if (isModuleNotFound(error)) {
      throw new SourceError(
        'discord.js is not installed. Install it next to this package with: npm install discord.js',
      );
    }
    throw error;
  }
  const candidate = (loaded as { default?: unknown }).default ?? loaded;
  const module = isDiscordModule(candidate) ? candidate : loaded;
  if (!isDiscordModule(module)) {
    throw new SourceError(
      'the installed discord.js does not provide the expected API; v14 is supported',
    );
  }
  return module;
}
