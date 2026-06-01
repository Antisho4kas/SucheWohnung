import { Injectable } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Telegram account linking via one-time deep-link token (FR-AUTH-6, §11.1, BR-8).
 * The token is stored hashed in email_tokens(purpose=tg_link); the bot resolves
 * it on /start <token> and creates the telegram_subscriptions row.
 */
@Injectable()
export class TelegramLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async createLink(userId: string): Promise<{ url: string; token: string; connected: boolean }> {
    // Check if already connected
    const existing = await this.prisma.telegramSubscription.findFirst({
      where: { userId, enabled: true },
    });

    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await this.prisma.emailToken.create({
      data: {
        userId,
        tokenHash,
        purpose: "tg_link",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const username = process.env.TELEGRAM_BOT_USERNAME ?? "SucheWohnungBot";
    return { url: `https://t.me/${username}?start=${token}`, token, connected: !!existing };
  }
}
