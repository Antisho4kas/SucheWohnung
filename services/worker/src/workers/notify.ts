import { DelayedError, Worker } from "bullmq";
import { Bot } from "grammy";
import { prisma as defaultPrisma } from "../prisma.js";
import { createRedisConnection } from "../redis.js";
import {
  classifyTelegramError,
  createRedisTelegramRateLimiter,
  createTelegramDedupeKey,
  sendTelegramListing,
  type TelegramApiLike,
  type TelegramRateLimiter,
} from "./telegram-delivery.js";

type NotifyJob = {
  data: {
    matchId: string;
    event?: "created" | "changed";
    changeVersion?: string;
  };
  attemptsMade?: number;
  opts?: { attempts?: number };
  moveToDelayed?: (timestamp: number, token?: string) => Promise<unknown>;
};

type SubscriptionRecord = {
  id: string;
  chatId: bigint | number | string;
  enabled: boolean;
};

type ListingRecord = {
  id: string;
  firstSeenAt: Date | string;
  url: string;
  city?: unknown;
  price?: unknown;
  area?: unknown;
  rooms?: unknown;
  source: { name?: unknown };
  images: Array<{ url?: unknown }>;
};

type MatchRecord = {
  id: string;
  state: string;
  matchedAt: Date | string;
  profile: {
    id: string;
    userId: string;
    autoReplyText?: string | null;
    user: { telegramSubscriptions: SubscriptionRecord[] };
  };
  listing: ListingRecord;
};

type NotificationRecord = {
  id: string;
  status: string;
};

type PrismaLike = {
  match: {
    findUnique(args: unknown): Promise<MatchRecord | null>;
    updateMany(args: unknown): Promise<unknown>;
  };
  notification: {
    findUnique(args: unknown): Promise<NotificationRecord | null>;
    findFirst(args: unknown): Promise<NotificationRecord | null>;
    create(args: unknown): Promise<NotificationRecord>;
    updateMany(args: unknown): Promise<unknown>;
  };
  telegramSubscription: {
    update(args: unknown): Promise<unknown>;
  };
};

type NotifyDeps = {
  prisma: PrismaLike;
  telegramApi: TelegramApiLike | null;
  rateLimiter: TelegramRateLimiter;
  now: () => Date;
};

const TERMINAL_NOTIFICATION_STATUSES = new Set(["sent", "failed", "skipped"]);

function createDefaultDeps(connection = createRedisConnection()): NotifyDeps {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const bot = botToken ? new Bot(botToken) : null;
  return {
    prisma: defaultPrisma as unknown as PrismaLike,
    telegramApi: bot ? (bot.api as unknown as TelegramApiLike) : null,
    rateLimiter: createRedisTelegramRateLimiter(connection),
    now: () => new Date(),
  };
}

function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function isLastAttempt(job: NotifyJob): boolean {
  const attempts = job.opts?.attempts ?? 1;
  const currentAttempt = (job.attemptsMade ?? 0) + 1;
  return currentAttempt >= attempts;
}

async function getOrCreateNotification(args: {
  deps: NotifyDeps;
  match: MatchRecord;
  subscription: SubscriptionRecord;
  dedupeKey: string;
}): Promise<NotificationRecord> {
  const existing = await args.deps.prisma.notification.findUnique({
    where: { dedupeKey: args.dedupeKey },
  });
  if (existing) return existing;

  try {
    return await args.deps.prisma.notification.create({
      data: {
        matchId: args.match.id,
        subscriptionId: args.subscription.id,
        channel: "telegram",
        status: "pending",
        dedupeKey: args.dedupeKey,
      },
    });
  } catch (err) {
    if (!isPrismaUniqueError(err)) throw err;
    const duplicate = await args.deps.prisma.notification.findUnique({
      where: { dedupeKey: args.dedupeKey },
    });
    if (duplicate) return duplicate;
    throw err;
  }
}

async function updateNotification(
  deps: NotifyDeps,
  dedupeKey: string,
  data: Record<string, unknown>,
): Promise<void> {
  await deps.prisma.notification.updateMany({
    where: { dedupeKey },
    data,
  });
}

async function updateClaimedNotification(
  deps: NotifyDeps,
  dedupeKey: string,
  data: Record<string, unknown>,
): Promise<void> {
  await deps.prisma.notification.updateMany({
    where: { dedupeKey, status: "queued" },
    data,
  });
}

function readUpdatedCount(result: unknown): number {
  return typeof result === "object" &&
    result !== null &&
    "count" in result &&
    typeof (result as { count?: unknown }).count === "number"
    ? (result as { count: number }).count
    : 0;
}

async function claimNotificationForSend(
  deps: NotifyDeps,
  dedupeKey: string,
): Promise<"claimed" | "done" | "in_flight"> {
  const claimed = await deps.prisma.notification.updateMany({
    where: { dedupeKey, status: "pending" },
    data: { status: "queued", error: null },
  });
  if (readUpdatedCount(claimed) === 1) return "claimed";

  const current = await deps.prisma.notification.findUnique({
    where: { dedupeKey },
  });
  if (current && TERMINAL_NOTIFICATION_STATUSES.has(current.status)) {
    return "done";
  }
  return "in_flight";
}

async function markMatchNotified(
  deps: NotifyDeps,
  matchId: string,
): Promise<void> {
  await deps.prisma.match.updateMany({
    where: { id: matchId, state: "pending" },
    data: { state: "notified" },
  });
}

/**
 * Anti-spam (per-user/per-listing): returns true when this listing has already
 * been delivered to this subscription via ANY rule/profile. A listing reaches
 * the user exactly once across all search rules; once delivered it is never
 * sent again (no re-notification on changes either, by product requirement).
 */
async function listingAlreadyDeliveredToSubscription(args: {
  deps: NotifyDeps;
  subscriptionId: string;
  listingId: string;
}): Promise<boolean> {
  const existing = await args.deps.prisma.notification.findFirst({
    where: {
      subscriptionId: args.subscriptionId,
      status: "sent",
      match: { listingId: args.listingId },
    },
  });
  return existing != null;
}

async function delayJob(args: {
  job: NotifyJob;
  token?: string;
  timestamp: number;
}): Promise<never> {
  if (args.job.moveToDelayed) {
    await args.job.moveToDelayed(args.timestamp, args.token);
    throw new DelayedError();
  }
  throw new Error("telegram_delay_unavailable");
}

async function handleRateLimit(args: {
  deps: NotifyDeps;
  job: NotifyJob;
  token?: string;
  dedupeKey: string;
  retryAfterMs: number;
  error: string;
  expectedStatus?: string;
}): Promise<never> {
  await args.deps.prisma.notification.updateMany({
    where: {
      dedupeKey: args.dedupeKey,
      ...(args.expectedStatus ? { status: args.expectedStatus } : {}),
    },
    data: {
      status: "pending",
      error: args.error,
    },
  });
  return delayJob({
    job: args.job,
    token: args.token,
    timestamp: args.deps.now().getTime() + args.retryAfterMs,
  });
}

async function deliverToSubscription(args: {
  deps: NotifyDeps;
  job: NotifyJob;
  token?: string;
  match: MatchRecord;
  subscription: SubscriptionRecord;
  dedupeKey: string;
  notification: NotificationRecord;
}): Promise<void> {
  if (TERMINAL_NOTIFICATION_STATUSES.has(args.notification.status)) return;

  if (args.notification.status === "queued") {
    throw new Error("telegram_delivery_in_flight");
  }

  if (!args.deps.telegramApi) {
    if (isLastAttempt(args.job)) {
      await updateNotification(args.deps, args.dedupeKey, {
        status: "failed",
        error: "bot_not_configured",
      });
      return;
    }
    await updateNotification(args.deps, args.dedupeKey, {
      status: "pending",
      error: "bot_not_configured",
    });
    throw new Error("bot_not_configured");
  }

  const claim = await claimNotificationForSend(args.deps, args.dedupeKey);
  if (claim === "done") return;
  if (claim === "in_flight") {
    throw new Error("telegram_delivery_in_flight");
  }

  const chatId = args.subscription.chatId.toString();
  const limit = await args.deps.rateLimiter.consume(chatId, args.deps.now());
  if (!limit.allowed) {
    await handleRateLimit({
      deps: args.deps,
      job: args.job,
      token: args.token,
      dedupeKey: args.dedupeKey,
      retryAfterMs: limit.retryAfterMs,
      error: `telegram_rate_limited:${limit.scope}`,
      expectedStatus: "queued",
    });
  }

  try {
    const replyText =
      args.match.profile.autoReplyText?.trim() ||
      process.env.DEFAULT_AUTOREPLY_TEXT ||
      null;
    await sendTelegramListing(
      args.deps.telegramApi,
      chatId,
      args.match.listing,
      replyText,
    );
  } catch (err) {
    const classification = classifyTelegramError(err);
    if (classification.kind === "blocked") {
      await args.deps.prisma.telegramSubscription.update({
        where: { id: args.subscription.id },
        data: { enabled: false },
      });
      await updateClaimedNotification(args.deps, args.dedupeKey, {
        status: "failed",
        error: classification.error,
      });
      return;
    }

    if (classification.kind === "permanent") {
      await updateClaimedNotification(args.deps, args.dedupeKey, {
        status: "failed",
        error: classification.error,
      });
      return;
    }

    if (classification.kind === "rate_limited") {
      await handleRateLimit({
        deps: args.deps,
        job: args.job,
        token: args.token,
        dedupeKey: args.dedupeKey,
        retryAfterMs: classification.retryAfterMs,
        error: classification.error,
        expectedStatus: "queued",
      });
    }

    if (isLastAttempt(args.job)) {
      await updateClaimedNotification(args.deps, args.dedupeKey, {
        status: "failed",
        error: classification.error,
      });
      return;
    }

    await updateClaimedNotification(args.deps, args.dedupeKey, {
      status: "pending",
      error: classification.error,
    });
    throw new Error(classification.error);
  }

  try {
    await updateClaimedNotification(args.deps, args.dedupeKey, {
      status: "sent",
      sentAt: args.deps.now(),
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`telegram_sent_state_update_failed:${message}`);
  }
}

export async function runNotifyJob(
  job: NotifyJob,
  token?: string,
  deps: NotifyDeps = createDefaultDeps(),
): Promise<void> {
  const { matchId } = job.data;
  const match = await deps.prisma.match.findUnique({
    where: { id: matchId },
    include: {
      profile: {
        include: { user: { include: { telegramSubscriptions: true } } },
      },
      listing: {
        include: { source: true, images: { orderBy: { position: "asc" } } },
      },
    },
  });

  if (!match) {
    console.warn(`[notify] Match ${matchId} not found`);
    return;
  }
  const event = job.data.event ?? "created";
  if (event === "changed" && !job.data.changeVersion) {
    throw new Error("changed notifications require changeVersion");
  }
  if (event === "created" && match.state !== "pending") {
    console.log(
      `[notify] Match ${matchId} already processed, state=${match.state}`,
    );
    return;
  }
  if (event === "changed" && match.state === "dismissed") {
    console.log(`[notify] Match ${matchId} dismissed, skipping changed event`);
    return;
  }

  const subscriptions = match.profile.user.telegramSubscriptions.filter(
    (sub) => sub.enabled,
  );
  if (subscriptions.length === 0) {
    console.log(
      `[notify] No active Telegram subscriptions for user ${match.profile.userId}`,
    );
    await markMatchNotified(deps, matchId);
    return;
  }

  for (const subscription of subscriptions) {
    // Anti-spam: skip if this listing already reached this user via any rule.
    if (
      await listingAlreadyDeliveredToSubscription({
        deps,
        subscriptionId: subscription.id,
        listingId: match.listing.id,
      })
    ) {
      console.log(
        `[notify] Listing ${match.listing.id} already delivered to subscription ${subscription.id}; skipping duplicate`,
      );
      continue;
    }

    const dedupeKey = createTelegramDedupeKey({
      subscriptionId: subscription.id,
      listingId: match.listing.id,
    });
    const notification = await getOrCreateNotification({
      deps,
      match,
      subscription,
      dedupeKey,
    });

    await deliverToSubscription({
      deps,
      job,
      token,
      match,
      subscription,
      dedupeKey,
      notification,
    });
  }

  await markMatchNotified(deps, matchId);
}

if (process.env.VITEST !== "true") {
  const connection = createRedisConnection();
  const deps = createDefaultDeps(connection);
  const worker = new Worker(
    "notify",
    async (job, token) => runNotifyJob(job as NotifyJob, token, deps),
    { connection, concurrency: 3 },
  );

  worker.on("completed", (job) => console.log(`[notify] completed ${job.id}`));
  worker.on("failed", (job, err) =>
    console.error(`[notify] failed ${job?.id}`, err),
  );

  console.log("[notify] Worker started");
}
