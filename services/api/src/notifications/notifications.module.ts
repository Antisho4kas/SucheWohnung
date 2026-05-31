import {
  Controller,
  Get,
  Module,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";

/** Notification history + test send (§08.5 Notifications). */
@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query("limit") limit = "50") {
    const data = await this.prisma.notification.findMany({
      where: { subscription: { userId: user.sub } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 50, 200),
      include: { match: { include: { listing: true } } },
    });
    return { data };
  }

  @Post("test")
  async test(@CurrentUser() user: JwtPayload) {
    const sub = await this.prisma.telegramSubscription.findFirst({
      where: { userId: user.sub, enabled: true },
    });
    if (!sub) {
      return { data: { ok: false, reason: "no_active_telegram_subscription" } };
    }
    // The bot service performs the actual send; here we only acknowledge.
    return { data: { ok: true, chat_id: sub.chatId.toString() } };
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
