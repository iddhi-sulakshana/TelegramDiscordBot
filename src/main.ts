import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Boot-time env diagnostic. Remove once verified.
  const seen = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? `set(len=${process.env.TELEGRAM_BOT_TOKEN.length})` : 'MISSING',
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL ? `set(len=${process.env.DISCORD_WEBHOOK_URL.length})` : 'MISSING',
    ALLOWED_CHAT_ID: process.env.ALLOWED_CHAT_ID ?? '(unset)',
    NODE_ENV: process.env.NODE_ENV ?? '(unset)',
  };
  console.log('[ENV DIAG]', JSON.stringify(seen));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  const logger = new Logger('Bootstrap');
  logger.log('Telegram -> Discord bridge started');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();
