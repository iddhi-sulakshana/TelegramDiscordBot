import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram/telegram.module.js';
import { DiscordModule } from './discord/discord.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    DiscordModule,
    TelegramModule,
  ],
})
export class AppModule {}
