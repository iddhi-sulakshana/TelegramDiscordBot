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

    this.bot = new Telegraf(token);
    this.registerHandlers();
  }

  async onModuleInit(): Promise<void> {
    this.bot.launch().catch((err) => this.logger.error('Bot crashed', err));
    this.logger.log('Telegraf launched');
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

    const fields = this.includeMetadata
      ? [
          { name: 'From', value: sender, inline: true },
          { name: 'Chat', value: chatTitle ?? 'Unknown', inline: true },
        ]
      : undefined;

    await this.discord.send({
      username: 'Telegram Bridge',
      embeds: [
        {
          description: text || '_(no text)_',
          color: 0x229ed9,
          timestamp: new Date(msg.date * 1000).toISOString(),
          footer: { text: `chat_id: ${chat.id}` },
          fields,
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
