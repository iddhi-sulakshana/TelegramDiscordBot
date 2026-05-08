import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  allowed_mentions?: {
    parse?: Array<'everyone' | 'users' | 'roles'>;
    users?: string[];
    roles?: string[];
  };
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    timestamp?: string;
    footer?: { text: string };
    fields?: DiscordEmbedField[];
    image?: { url: string };
  }>;
}

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);
  private readonly webhookUrl: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('DISCORD_WEBHOOK_URL');
    if (!url) throw new Error('DISCORD_WEBHOOK_URL is required');
    this.webhookUrl = url;
  }

  async send(payload: DiscordPayload): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      this.logger.warn(`Rate limited, retry in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.send(payload);
    }

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Webhook failed ${res.status}: ${body}`);
      throw new Error(`Discord webhook failed: ${res.status}`);
    }
  }
}
