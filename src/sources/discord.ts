import { OptionError, SourceError, TicketDataError } from '../errors.js';
import { replaceUnsafeCharacters } from '../text.js';
import type { AuthorRole, Ticket } from '../model.js';
import { buildTickets, IssueCollector, type RawTicket } from '../validate.js';
import {
  importDiscord,
  type DiscordCategoryLike,
  type DiscordChannelLike,
  type DiscordClientLike,
  type DiscordGuildLike,
  type DiscordMessageLike,
  type DiscordModule,
  type DiscordUserLike,
} from './discord-module.js';
import type { TicketSource } from './source.js';

export interface DiscordSourceOptions {
  token: string;
  categoryId: string;
  closedCategoryId?: string;
  staffRoleIds: readonly string[];
  maxChannels?: number;
  maxMessagesPerChannel?: number;
  loadDiscord?: () => Promise<DiscordModule>;
}

export const DEFAULT_MAX_CHANNELS = 1000;
export const DEFAULT_MAX_MESSAGES_PER_CHANNEL = 10_000;

const PAGE_SIZE = 100;
const SNOWFLAKE = /^\d{17,20}$/;
const MAX_LABEL_LENGTH = 100;
const UNKNOWN_MEMBER_CODES = [10007, 10013];
const UNKNOWN_USER_LABEL = 'unknown';

function cleanLabel(value: string): string {
  return replaceUnsafeCharacters(value).trim().slice(0, MAX_LABEL_LENGTH) || UNKNOWN_USER_LABEL;
}

function requireId(name: string, value: string): void {
  if (!SNOWFLAKE.test(value)) throw new OptionError(`${name} must be a Discord ID (17-20 digits)`);
}

function requireLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OptionError(`${name} must be a positive integer`);
  }
  return value;
}

function toIso(ms: number | undefined): string | undefined {
  return ms !== undefined && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function olderOf(left: DiscordMessageLike, right: DiscordMessageLike): DiscordMessageLike {
  return BigInt(right.id) < BigInt(left.id) ? right : left;
}

export class DiscordTicketSource implements TicketSource {
  private readonly options: DiscordSourceOptions;
  private readonly maxChannels: number;
  private readonly maxMessages: number;

  constructor(options: DiscordSourceOptions) {
    if (options.token.trim() === '') throw new OptionError('a Discord bot token is required');
    requireId('category ID', options.categoryId);
    if (options.closedCategoryId !== undefined)
      requireId('closed category ID', options.closedCategoryId);
    if (options.staffRoleIds.length === 0) {
      throw new OptionError('at least one staff role ID is required to tell staff from users');
    }
    options.staffRoleIds.forEach((id) => {
      requireId('staff role ID', id);
    });
    this.options = options;
    this.maxChannels = requireLimit('max channels', options.maxChannels ?? DEFAULT_MAX_CHANNELS);
    this.maxMessages = requireLimit(
      'max messages per channel',
      options.maxMessagesPerChannel ?? DEFAULT_MAX_MESSAGES_PER_CHANNEL,
    );
  }

  async load(): Promise<Ticket[]> {
    const discord = await (this.options.loadDiscord ?? importDiscord)();
    const client = new discord.Client({ intents: [discord.GatewayIntentBits.Guilds] });
    try {
      await client.login(this.options.token);
      const raws: RawTicket[] = [];
      const targets = [
        { id: this.options.categoryId, status: 'open' },
        ...(this.options.closedCategoryId === undefined
          ? []
          : [{ id: this.options.closedCategoryId, status: 'closed' }]),
      ];
      for (const target of targets) {
        raws.push(...(await this.collect(discord, client, target.id, target.status)));
      }
      if (raws.length > this.maxChannels) {
        throw new SourceError(
          `found more than ${this.maxChannels} ticket channels; raise the channel limit`,
        );
      }
      return buildTickets(raws, new IssueCollector());
    } catch (error) {
      throw this.sanitize(error);
    } finally {
      await client.destroy();
    }
  }

  private sanitize(error: unknown): Error {
    if (
      error instanceof SourceError ||
      error instanceof OptionError ||
      error instanceof TicketDataError
    ) {
      return error;
    }
    const message = error instanceof Error ? error.message : 'unknown error';
    return new SourceError(
      `Discord request failed: ${message.replaceAll(this.options.token, '[redacted]')}`,
    );
  }

  private async collect(
    discord: DiscordModule,
    client: DiscordClientLike,
    categoryId: string,
    status: string,
  ): Promise<RawTicket[]> {
    const category = await client.channels.fetch(categoryId);
    if (category?.type !== discord.ChannelType.GuildCategory) {
      throw new SourceError(`channel ${categoryId} was not found or is not a category`);
    }
    const all = await category.guild.channels.fetch();
    const children = [...all.values()]
      .filter(
        (channel): channel is DiscordChannelLike =>
          channel !== null &&
          channel.parentId === categoryId &&
          channel.type === discord.ChannelType.GuildText,
      )
      .sort((left, right) => (BigInt(left.id) < BigInt(right.id) ? -1 : 1));
    if (children.length > this.maxChannels) {
      throw new SourceError(
        `category ${categoryId} has more than ${this.maxChannels} ticket channels`,
      );
    }

    const staffCache = new Map<string, boolean>();
    const raws: RawTicket[] = [];
    for (const channel of children) {
      raws.push(await this.toRawTicket(channel, category, status, staffCache));
    }
    return raws;
  }

  private async roleOf(
    guild: DiscordGuildLike,
    user: DiscordUserLike,
    cache: Map<string, boolean>,
  ): Promise<AuthorRole> {
    if (user.bot) return 'bot';
    return (await this.isStaff(guild, user.id, cache)) ? 'staff' : 'user';
  }

  private async toRawTicket(
    channel: DiscordChannelLike,
    category: DiscordCategoryLike,
    status: string,
    staffCache: Map<string, boolean>,
  ): Promise<RawTicket> {
    const fetched = (await this.fetchMessages(channel)).sort(
      (left, right) => left.createdTimestamp - right.createdTimestamp,
    );
    const messages = [];
    for (const message of fetched) {
      messages.push({
        author: cleanLabel(message.author.username),
        authorRole: await this.roleOf(category.guild, message.author, staffCache),
        timestamp: toIso(message.createdTimestamp),
      });
    }

    const createdAt = toIso(channel.createdTimestamp ?? fetched[0]?.createdTimestamp);
    const opener = messages.find((message) => message.authorRole === 'user');
    const responder = messages.find((message) => message.authorRole === 'staff');
    const closedAt = status === 'closed' ? (messages.at(-1)?.timestamp ?? createdAt) : undefined;

    return {
      location: `channel ${channel.id}`,
      fields: {
        id: channel.id,
        createdAt,
        closedAt,
        user: opener?.author ?? UNKNOWN_USER_LABEL,
        staff: responder?.author,
        category: cleanLabel(category.name),
        status,
      },
      messages: messages.map((message, index) => ({
        location: `channel ${channel.id}, message #${index + 1}`,
        fields: message,
      })),
    };
  }

  private async isStaff(
    guild: DiscordGuildLike,
    userId: string,
    cache: Map<string, boolean>,
  ): Promise<boolean> {
    const known = cache.get(userId);
    if (known !== undefined) return known;
    let staff = false;
    try {
      const member = await guild.members.fetch(userId);
      staff = this.options.staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code !== 'number' || !UNKNOWN_MEMBER_CODES.includes(code)) throw error;
    }
    cache.set(userId, staff);
    return staff;
  }

  private async fetchMessages(channel: DiscordChannelLike): Promise<DiscordMessageLike[]> {
    const collected: DiscordMessageLike[] = [];
    let before: string | undefined;
    for (;;) {
      const page = [
        ...(
          await channel.messages.fetch(
            before === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, before },
          )
        ).values(),
      ];
      collected.push(...page);
      if (collected.length > this.maxMessages) {
        throw new SourceError(
          `channel ${channel.id} has more than ${this.maxMessages} messages; raise the message limit`,
        );
      }
      const oldest = page.reduce<DiscordMessageLike | undefined>(
        (current, message) => (current === undefined ? message : olderOf(current, message)),
        undefined,
      );
      if (page.length < PAGE_SIZE || oldest === undefined) return collected;
      before = oldest.id;
    }
  }
}
