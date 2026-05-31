import { Worker } from "bullmq";
import { prisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import { Bot } from "grammy";

const connection = createRedisConnection();

const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
const bot = botToken ? new Bot(botToken) : null;

async function runNotifyJob(job: { data: { matchId: string } }): Promise<void> {
  const { matchId } = job.data;
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      profile: { include: { user: { include: { telegramSubscriptions: true } } } },
      listing: { include: { source: true, images: true } },
    },
  });
  if (!match) {
    console.warn(`[notify] Match ${matchId} not found`);
    return;
  }
  if (match.state !== "pending") {
    console.log(`[notify] Match ${matchId} already processed, state=${match.state}`);
    return;
  }

  const subscriptions = match.profile.user.telegramSubscriptions.filter((s) => s.enabled);
  if (subscriptions.length === 0) {
    console.log(`[notify] No active Telegram subscriptions for user ${match.profile.userId}`);
    await prisma.match.update({ where: { id: matchId }, data: { state: "notified" } });
    return;
  }

  const l = match.listing;
  const caption = `🏠 <b>Новая квартира найдена</b>\n\n📍 ${l.city ?? ""}\n💰 ${l.price ?? "—"} €\n📐 ${l.area ?? "—"} м²\n🛏 ${l.rooms ?? "—"} комнаты\n\n🔗 <a href="${l.url}">Ссылка на объявление</a>\n\nИсточник: ${l.source.name}`;

  for (const sub of subscriptions) {
    const dedupeKey = `match:${match.id}:sub:${sub.id}`;
    const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
    if (existing) {
      console.log(`[notify] Already sent to sub ${sub.id}, skipping`);
      continue;
    }

    await prisma.notification.create({
      data: {
        matchId: match.id,
        subscriptionId: sub.id,
        channel: "telegram",
        status: "pending",
        dedupeKey,
      },
    });

    if (!bot) {
      console.warn("[notify] Telegram bot not configured, skipping send");
      await prisma.notification.updateMany({
        where: { dedupeKey },
        data: { status: "failed", error: "bot_not_configured" },
      });
      continue;
    }

    try {
      const image = l.images[0]?.url;
      if (image) {
        await bot.api.sendPhoto(sub.chatId.toString(), image, { caption, parse_mode: "HTML" });
      } else {
        await bot.api.sendMessage(sub.chatId.toString(), caption, { parse_mode: "HTML" });
      }
      await prisma.notification.updateMany({
        where: { dedupeKey },
        data: { status: "sent", sentAt: new Date() },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[notify] Failed to send to ${sub.chatId}:`, msg);
      await prisma.notification.updateMany({
        where: { dedupeKey },
        data: { status: "failed", error: msg },
      });
    }
  }

  await prisma.match.update({ where: { id: matchId }, data: { state: "notified" } });
}

const worker = new Worker("notify", async (job) => runNotifyJob(job), { connection, concurrency: 3 });

worker.on("completed", (job) => console.log(`[notify] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[notify] failed ${job?.id}`, err));

console.log("[notify] Worker started");
