import { PrismaClient } from "@suchewohnung/database";
import { createTelegramBot, processTelegramUpdate } from "@suchewohnung/telegram";
import { startTelegramQueueConsumer } from "./telegram-queue-consumer.js";

const prisma = new PrismaClient();
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

if (!botToken) {
  console.error("[bot] TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const bot = createTelegramBot({ token: botToken, prisma });
const cleanupTasks: Array<() => Promise<void>> = [() => prisma.$disconnect()];
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bot] Shutting down after ${signal}`);
  if (bot.isRunning()) {
    await bot.stop();
  }
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
}

process.once("SIGINT", (signal) => {
  void shutdown(signal).finally(() => process.exit(0));
});
process.once("SIGTERM", (signal) => {
  void shutdown(signal).finally(() => process.exit(0));
});

async function main(): Promise<void> {
  const useWebhook = process.env.TELEGRAM_USE_WEBHOOK === "true";
  if (useWebhook) {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL ?? "";
    if (!webhookUrl) {
      console.error("[bot] TELEGRAM_WEBHOOK_URL is required for webhook mode");
      process.exit(1);
    }
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
    if (!webhookSecret) {
      console.error("[bot] TELEGRAM_WEBHOOK_SECRET is required for webhook mode");
      process.exit(1);
    }
    await bot.api.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
    });
    const consumer = startTelegramQueueConsumer((update) => processTelegramUpdate(bot, update));
    cleanupTasks.unshift(async () => {
      await consumer.worker.close();
      await consumer.connection.quit();
    });
    console.log("[bot] Webhook set to", webhookUrl);
  } else {
    console.log("[bot] Starting long polling...");
    await bot.start({ drop_pending_updates: false });
  }
}

main().catch((err) => {
  console.error("[bot] Fatal error", err);
  process.exit(1);
});

export { bot };
