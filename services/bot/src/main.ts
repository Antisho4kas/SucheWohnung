import { Bot, session } from "grammy";
import { PrismaClient } from "@suchewohnung/database";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

if (!botToken) {
  console.error("[bot] TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const bot = new Bot(botToken);

bot.use(session({ initial: () => ({}) }) as any);

bot.command("start", async (ctx) => {
  const args = ctx.match?.toString().trim() ?? "";
  if (!args) {
    await ctx.reply("Добро пожаловать! Используйте ссылку из веб-панели для привязки аккаунта.");
    return;
  }

  // Verify one-time token from email_tokens
  const tokenHash = createHash("sha256").update(args).digest("hex");
  const token = await prisma.emailToken.findFirst({
    where: { tokenHash, purpose: "tg_link", usedAt: null },
    include: { user: true },
  });
  if (!token || token.expiresAt < new Date()) {
    await ctx.reply("Ссылка устарела или недействительна.");
    return;
  }

  const chatId = ctx.chatId;
  const existingSub = await prisma.telegramSubscription.findFirst({
    where: { userId: token.userId, chatId },
  });
  if (existingSub) {
    await prisma.telegramSubscription.update({
      where: { id: existingSub.id },
      data: { enabled: true },
    });
  } else {
    await prisma.telegramSubscription.create({
      data: { userId: token.userId, chatId, enabled: true },
    });
  }
  await prisma.emailToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });

  await ctx.reply(`✅ Аккаунт ${token.user.email} привязан. Вы будете получать уведомления о новых квартирах.`);
});

bot.command("profiles", async (ctx) => {
  const chatId = ctx.chatId;
  const sub = await prisma.telegramSubscription.findFirst({
    where: { chatId, enabled: true },
    include: { user: { include: { searchProfiles: true } } },
  });
  if (!sub) {
    await ctx.reply("Аккаунт не привязан. Используйте ссылку из веб-панели.");
    return;
  }

  const profiles = sub.user.searchProfiles;
  if (profiles.length === 0) {
    await ctx.reply("У вас пока нет поисковых профилей.");
    return;
  }

  const lines = profiles.map((p, i) => `${i + 1}. ${p.name} — ${p.isActive && p.notify ? "✅" : "❌"}`);
  await ctx.reply(`Ваши профили:\n${lines.join("\n")}\n\nИспользуйте /pause для паузы всех уведомлений.`);
});

bot.command("pause", async (ctx) => {
  const chatId = ctx.chatId;
  await prisma.telegramSubscription.updateMany({
    where: { chatId },
    data: { enabled: false },
  });
  await ctx.reply("🔕 Все уведомления приостановлены. /resume чтобы возобновить.");
});

bot.command("resume", async (ctx) => {
  const chatId = ctx.chatId;
  await prisma.telegramSubscription.updateMany({
    where: { chatId },
    data: { enabled: true },
  });
  await ctx.reply("🔔 Уведомления возобновлены.");
});

bot.command("stop", async (ctx) => {
  const chatId = ctx.chatId;
  await prisma.telegramSubscription.deleteMany({ where: { chatId } });
  await ctx.reply("Аккаунт отвязан. Вы больше не будете получать уведомления.");
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    `Команды:\n/start <token> — привязка аккаунта\n/profiles — список профилей\n/pause — остановить уведомления\n/resume — возобновить\n/stop — отвязать аккаунт\n/help — справка`,
  );
});

async function main(): Promise<void> {
  const useWebhook = process.env.TELEGRAM_USE_WEBHOOK === "true";
  if (useWebhook) {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL ?? "";
    if (!webhookUrl) {
      console.error("[bot] TELEGRAM_WEBHOOK_URL is required for webhook mode");
      process.exit(1);
    }
    await bot.api.setWebhook(webhookUrl, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    });
    console.log("[bot] Webhook set to", webhookUrl);
  } else {
    console.log("[bot] Starting long polling...");
    await bot.start();
  }
}

main().catch((err) => {
  console.error("[bot] Fatal error", err);
  process.exit(1);
});

export { bot };
