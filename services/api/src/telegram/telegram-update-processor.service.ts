import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createTelegramBot, processTelegramUpdate, type TelegramBot } from "@suchewohnung/telegram";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class TelegramUpdateProcessorService {
  private bot: TelegramBot | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async process(update: unknown): Promise<void> {
    await processTelegramUpdate(this.getBot(), update);
  }

  private getBot(): TelegramBot {
    if (this.bot) return this.bot;

    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!token) {
      throw new ServiceUnavailableException("Telegram bot token is not configured");
    }

    this.bot = createTelegramBot({ token, prisma: this.prisma });
    return this.bot;
  }
}
