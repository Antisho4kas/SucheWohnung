import { createHash } from "node:crypto";
import { Bot, session, type BotConfig } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { PrismaClient } from "@suchewohnung/database";

export const TELEGRAM_QUEUE_NAME = "telegram";
export const TELEGRAM_UPDATE_JOB_NAME = "update";
export const TELEGRAM_PRIVATE_CHAT_ONLY_REPLY = "Please open bot in private chat";

export type TelegramBot = Bot;

export type TelegramPrisma = Pick<
  PrismaClient,
  "emailToken" | "telegramSubscription"
>;

export type TelegramBotDeps = {
  token: string;
  prisma: TelegramPrisma;
  now?: () => Date;
  botInfo?: UserFromGetMe;
};

type PrivateChatGuardContext = {
  chat?: { type?: string };
  reply: (text: string) => Promise<unknown>;
};

async function requirePrivateChat(ctx: unknown): Promise<boolean> {
  const guardCtx = ctx as PrivateChatGuardContext;
  if (guardCtx.chat?.type === "private") {
    return true;
  }
  await guardCtx.reply(TELEGRAM_PRIVATE_CHAT_ONLY_REPLY);
  return false;
}

export function createTelegramBot(args: TelegramBotDeps): TelegramBot {
  const config: BotConfig<any> = args.botInfo ? { botInfo: args.botInfo } : {};
  const bot = new Bot(args.token, config);
  const now = args.now ?? (() => new Date());

  bot.use(session({ initial: () => ({}) }) as any);

  bot.command("start", async (ctx) => {
    if (!(await requirePrivateChat(ctx))) {
      return;
    }

    const tokenValue = ctx.match?.toString().trim() ?? "";
    if (!tokenValue) {
      await ctx.reply("Добро пожаловать! Используйте ссылку из веб-панели для привязки аккаунта.");
      return;
    }

    const tokenHash = createHash("sha256").update(tokenValue).digest("hex");
    const token = await args.prisma.emailToken.findFirst({
      where: { tokenHash, purpose: "tg_link", usedAt: null },
    });
    if (!token || token.expiresAt <= now()) {
      await ctx.reply("Ссылка устарела или недействительна.");
      return;
    }

    const chatId = ctx.chatId;
    if (chatId === undefined) {
      await ctx.reply("Не удалось определить Telegram chat_id.");
      return;
    }

    const claim = await args.prisma.emailToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now() },
    });
    if (claim.count !== 1) {
      await ctx.reply("Ссылка устарела или недействительна.");
      return;
    }

    const existingSub = await args.prisma.telegramSubscription.findFirst({
      where: { userId: token.userId, chatId },
    });
    if (existingSub) {
      await args.prisma.telegramSubscription.update({
        where: { id: existingSub.id },
        data: { enabled: true },
      });
    } else {
      await args.prisma.telegramSubscription.create({
        data: { userId: token.userId, chatId, enabled: true },
      });
    }
    await ctx.reply("Аккаунт привязан. Вы будете получать уведомления о новых квартирах.");
  });

  bot.command("profiles", async (ctx) => {
    if (!(await requirePrivateChat(ctx))) {
      return;
    }

    const chatId = ctx.chatId;
    if (chatId === undefined) {
      await ctx.reply("Не удалось определить Telegram chat_id.");
      return;
    }
    const sub = await args.prisma.telegramSubscription.findFirst({
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
    if (!(await requirePrivateChat(ctx))) {
      return;
    }

    const chatId = ctx.chatId;
    if (chatId === undefined) {
      await ctx.reply("Не удалось определить Telegram chat_id.");
      return;
    }
    await args.prisma.telegramSubscription.updateMany({
      where: { chatId },
      data: { enabled: false },
    });
    await ctx.reply("🔕 Все уведомления приостановлены. /resume чтобы возобновить.");
  });

  bot.command("resume", async (ctx) => {
    if (!(await requirePrivateChat(ctx))) {
      return;
    }

    const chatId = ctx.chatId;
    if (chatId === undefined) {
      await ctx.reply("Не удалось определить Telegram chat_id.");
      return;
    }
    await args.prisma.telegramSubscription.updateMany({
      where: { chatId },
      data: { enabled: true },
    });
    await ctx.reply("🔔 Уведомления возобновлены.");
  });

  bot.command("stop", async (ctx) => {
    if (!(await requirePrivateChat(ctx))) {
      return;
    }

    const chatId = ctx.chatId;
    if (chatId === undefined) {
      await ctx.reply("Не удалось определить Telegram chat_id.");
      return;
    }
    await args.prisma.telegramSubscription.updateMany({
      where: { chatId },
      data: { enabled: false },
    });
    await ctx.reply("Уведомления отключены для этого Telegram-чата.");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `Команды:\n/start <token> — привязка аккаунта\n/profiles — список профилей\n/pause — остановить уведомления\n/resume — возобновить\n/stop — отвязать аккаунт\n/help — справка`,
    );
  });

  return bot;
}

export async function processTelegramUpdate(bot: TelegramBot, update: unknown): Promise<void> {
  if (!bot.isInited()) {
    await bot.init();
  }
  await bot.handleUpdate(update as Update);
}
