import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { TelegramService } from './telegram.service.js';

@Module({
  imports: [DiscordModule],
  providers: [TelegramService],
})
export class TelegramModule {}
