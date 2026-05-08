import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, type Context } from 'telegraf';
import type { Message } from 'telegraf/types';
import { DiscordService } from '../discord/discord.service.js';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private readonly allowedChatId?: number;
  private readonly includeMetadata: boolean;
  private readonly priorityUserIds: Set<number>;
  private readonly meetingLink?: string;
  private static readonly JOIN_REGEX = /\bjoi(n)?\b/i;
  private static readonly COLOR_DEFAULT = 0x229ed9;
  private static readonly COLOR_PRIORITY = 0xed4245;

  constructor(
    config: ConfigService,
    private readonly discord: DiscordService,
  ) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

    const allowed = config.get<string>('ALLOWED_CHAT_ID');
    this.allowedChatId = allowed ? Number(allowed) : undefined;
    this.includeMetadata =
      config.get<string>('INCLUDE_METADATA', 'true').toLowerCase() !== 'false';

    const priorityRaw = config.get<string>('PRIORITY_USER_IDS', '');
    this.priorityUserIds = new Set(
      priorityRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n)),
    );

    this.meetingLink = config.get<string>('MEETING_LINK')?.trim() || undefined;

    this.bot = new Telegraf(token);
    this.registerHandlers();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
      this.logger.log('Cleared any prior webhook registration');
    } catch (err) {
      this.logger.warn(`deleteWebhook failed: ${(err as Error).message}`);
    }
    void this.launchWithRetry();
  }

  private async launchWithRetry(attempt = 1): Promise<void> {
    try {
      await this.bot.launch();
      this.logger.log('Telegraf launched');
    } catch (err) {
      const e = err as { response?: { error_code?: number } };
      const code = e?.response?.error_code;
      const wait = Math.min(60_000, 2_000 * attempt);
      this.logger.error(
        `launch failed (code=${code}, attempt=${attempt}). Retry in ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
      return this.launchWithRetry(attempt + 1);
    }
  }

  onModuleDestroy(): void {
    this.bot.stop('SIGTERM');
  }

  private registerHandlers(): void {
    this.bot.on('message', async (ctx) => {
      try {
        if (!ctx.chat) return;
        if (this.allowedChatId && ctx.chat.id !== this.allowedChatId) return;
        await this.forward(ctx);
      } catch (err) {
        this.logger.error('Forward failed', err as Error);
      }
    });
  }

  private async forward(ctx: Context): Promise<void> {
    const msg = ctx.message as Message | undefined;
    if (!msg || !ctx.chat) return;

    const chat = ctx.chat;
    const sender = this.formatSender(msg);
    const chatTitle = 'title' in chat ? chat.title : 'Direct';
    const text = this.extractText(msg);
    const mediaUrl = await this.extractMediaUrl(ctx, msg);

    const senderId = msg.from?.id;
    const isPriority = senderId !== undefined && this.priorityUserIds.has(senderId);
    const isJoin =
      isPriority && typeof text === 'string' && TelegramService.JOIN_REGEX.test(text);

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
    if (this.includeMetadata) {
      fields.push(
        { name: 'From', value: sender, inline: true },
        { name: 'Chat', value: chatTitle ?? 'Unknown', inline: true },
      );
    }
    if (isJoin && this.meetingLink) {
      fields.push({ name: 'Meeting Link', value: this.meetingLink, inline: false });
    }

    const color = isPriority
      ? TelegramService.COLOR_PRIORITY
      : TelegramService.COLOR_DEFAULT;

    const description = isJoin
      ? `🚨 **JOIN REQUEST** 🚨\n\n${text}`
      : text || '_(no text)_';

    await this.discord.send({
      username: 'Telegram Bridge',
      content: isJoin ? '@everyone 🚨 join request from priority user' : undefined,
      allowed_mentions: isJoin ? { parse: ['everyone'] } : { parse: [] },
      embeds: [
        {
          description,
          url: isJoin ? this.meetingLink : undefined,
          color,
          timestamp: new Date(msg.date * 1000).toISOString(),
          footer: { text: `chat_id: ${chat.id}${isPriority ? ' • PRIORITY' : ''}` },
          fields: fields.length ? fields : undefined,
          image: mediaUrl ? { url: mediaUrl } : undefined,
        },
      ],
    });
  }

  private formatSender(msg: Message): string {
    const u = msg.from;
    if (!u) return 'Unknown';
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
    return u.username ? `${name} (@${u.username})` : name || `id:${u.id}`;
  }

  private extractText(msg: Message): string {
    if ('text' in msg && msg.text) return msg.text;
    if ('caption' in msg && msg.caption) return msg.caption;
    if ('photo' in msg) return '[photo]';
    if ('video' in msg) return '[video]';
    if ('document' in msg) return `[document: ${msg.document.file_name ?? ''}]`;
    if ('voice' in msg) return '[voice]';
    if ('audio' in msg) return '[audio]';
    if ('sticker' in msg) return `[sticker ${msg.sticker.emoji ?? ''}]`;
    if ('location' in msg)
      return `[location ${msg.location.latitude},${msg.location.longitude}]`;
    return '[unsupported message type]';
  }

  private async extractMediaUrl(
    ctx: Context,
    msg: Message,
  ): Promise<string | undefined> {
    try {
      if ('photo' in msg && msg.photo.length) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const link = await ctx.telegram.getFileLink(fileId);
        return link.toString();
      }
    } catch (err) {
      this.logger.warn(`Failed to resolve media: ${(err as Error).message}`);
    }
    return undefined;
  }
}
