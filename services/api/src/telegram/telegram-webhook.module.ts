import {
  Controller,
  Headers,
  HttpCode,
  Module,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../auth/guards.js";
import { QueueService } from "../queue/queue.service.js";

/**
 * Telegram webhook ingress (§08.5, §11.1). Validates the secret token header
 * and enqueues the raw update for the bot worker to process. Keeps the HTTP
 * layer thin and async (§05.8 async-first).
 */
@ApiTags("telegram")
@Public()
@Controller("api/v1/telegram")
export class TelegramWebhookController {
  constructor(private readonly queue: QueueService) {}

  @Public()
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Req() req: Request,
  ): Promise<{ ok: boolean }> {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && secret !== expected) {
      throw new UnauthorizedException("Invalid webhook secret");
    }
    await this.queue.enqueueTelegramUpdate(req.body);
    return { ok: true };
  }
}

@Module({
  controllers: [TelegramWebhookController],
})
export class TelegramWebhookModule {}
