import { createHash } from "node:crypto";

type TelegramInlineButton = { text: string; url: string };

type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineButton[][];
};

type TelegramSendOptions = {
  parse_mode: "HTML";
  caption?: string;
  reply_markup?: TelegramReplyMarkup;
};

export type TelegramApiLike = {
  sendMessage(
    chatId: string,
    text: string,
    options: TelegramSendOptions,
  ): Promise<unknown>;
  sendPhoto(
    chatId: string,
    photo: string,
    options: TelegramSendOptions,
  ): Promise<unknown>;
};

export type TelegramListingPayload = {
  id: string;
  url: string;
  city?: unknown;
  price?: unknown;
  area?: unknown;
  rooms?: unknown;
  source: { name?: unknown };
  images?: Array<{ url?: unknown }>;
};

export type TelegramRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; scope: "global" | "chat" };

export type TelegramRateLimiter = {
  consume(chatId: string, now: Date): Promise<TelegramRateLimitResult>;
};

type RedisRateLimitConnection = {
  eval?: (...args: unknown[]) => Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<unknown>;
  pttl?: (key: string) => Promise<number>;
};

type TelegramErrorResponse = {
  errorCode?: number;
  description?: string;
  retryAfterSeconds?: number;
};

export type TelegramErrorClassification =
  | { kind: "blocked"; error: "telegram_bot_blocked" }
  | { kind: "permanent"; error: string }
  | { kind: "rate_limited"; retryAfterMs: number; error: string }
  | { kind: "retryable"; error: string };

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const DEFAULT_GLOBAL_RATE_LIMIT_PER_SECOND = 30;
const DEFAULT_CHAT_RATE_LIMIT_PER_SECOND = 1;
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_TTL_MS = RATE_LIMIT_WINDOW_MS * 2;

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => HTML_ENTITIES[char] ?? char,
  );
}

function displayValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return escapeTelegramHtml(value);
}

function toHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function renderTelegramNotification(
  listing: TelegramListingPayload,
  replyText?: string | null,
): string {
  const listingUrl = toHttpUrl(listing.url);
  const link = listingUrl
    ? `🔗 <a href="${escapeTelegramHtml(listingUrl)}">Ссылка на объявление</a>`
    : "🔗 Ссылка на объявление недоступна";

  const lines = [
    "🏠 <b>Новая квартира найдена</b>",
    "",
    `📍 ${displayValue(listing.city, "")}`,
    `💰 ${displayValue(listing.price)} €`,
    `📐 ${displayValue(listing.area)} м²`,
    `🛏 ${displayValue(listing.rooms)} комнаты`,
    "",
    link,
    "",
    `Источник: ${displayValue(listing.source.name, "")}`,
  ];

  // Embed the seller reply as a <pre> block: Telegram renders it with a
  // one-tap copy control and, unlike a copy_text button (256-char cap), has
  // no such limit — so the full message (incl. phone/email) is copied intact.
  // Sending stays a manual step, so the user's kleinanzeigen account is safe.
  const reply = replyText?.trim();
  if (reply) {
    lines.push(
      "",
      "✍️ <b>Готовый текст ответа</b> (нажмите, чтобы скопировать):",
      `<pre>${escapeTelegramHtml(reply)}</pre>`,
    );
  }

  return lines.join("\n");
}

/**
 * Inline keyboard for a listing notification: a single "open listing" URL
 * button (one tap to the kleinanzeigen page with its contact form). The reply
 * text itself is embedded in the message body as a copyable <pre> block, not a
 * button, because copy_text buttons are capped at 256 chars.
 */
export function buildListingReplyMarkup(args: {
  listingUrl: unknown;
}): TelegramReplyMarkup | undefined {
  const url = toHttpUrl(args.listingUrl);
  if (!url) return undefined;
  return { inline_keyboard: [[{ text: "🔗 Открыть и написать", url }]] };
}

export async function sendTelegramListing(
  api: TelegramApiLike,
  chatId: string,
  listing: TelegramListingPayload,
  replyText?: string | null,
): Promise<void> {
  const caption = renderTelegramNotification(listing, replyText);
  const replyMarkup = buildListingReplyMarkup({ listingUrl: listing.url });
  const image = listing.images
    ?.map((candidate) => toHttpUrl(candidate.url))
    .find((url) => url !== undefined);

  if (typeof image === "string") {
    try {
      await api.sendPhoto(chatId, image, {
        caption,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return;
    } catch (err) {
      if (classifyTelegramError(err).kind !== "permanent") throw err;
    }
  }

  await api.sendMessage(chatId, caption, {
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function createTelegramDedupeKey(args: {
  subscriptionId: string;
  listingId: string;
}): string {
  const hash = createHash("sha256")
    .update(`${args.subscriptionId}:${args.listingId}`)
    .digest("hex");
  return `telegram:${hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function readDescription(value: Record<string, unknown>): string | undefined {
  if (typeof value.description === "string") return value.description;
  if (typeof value.message === "string") return value.message;
  return undefined;
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot<redacted>")
    .slice(0, 300);
}

function readRetryAfterSeconds(
  value: Record<string, unknown>,
  description?: string,
): number | undefined {
  const parameters = isRecord(value.parameters) ? value.parameters : undefined;
  const retryAfter = toPositiveInteger(parameters?.retry_after);
  if (retryAfter) return retryAfter;

  const match = description?.match(/retry after\s+(\d+)/i);
  return toPositiveInteger(match?.[1]);
}

function readTelegramErrorResponse(error: unknown): TelegramErrorResponse {
  const root = isRecord(error) ? error : {};
  const response = isRecord(root.response) ? root.response : root;
  const errorCode = toPositiveInteger(
    response.error_code ??
      response.errorCode ??
      root.error_code ??
      root.errorCode,
  );
  const description = readDescription(response) ?? readDescription(root);
  const retryAfterSeconds =
    readRetryAfterSeconds(response, description) ??
    readRetryAfterSeconds(root, description);
  return { errorCode, description, retryAfterSeconds };
}

export function classifyTelegramError(
  error: unknown,
): TelegramErrorClassification {
  const response = readTelegramErrorResponse(error);
  const rawDescription =
    response.description ??
    (error instanceof Error ? error.message : String(error));
  const description = sanitizeErrorMessage(rawDescription);

  if (response.errorCode === 429) {
    const retryAfterSeconds = response.retryAfterSeconds ?? 1;
    return {
      kind: "rate_limited",
      retryAfterMs: retryAfterSeconds * 1_000,
      error: `telegram_retry_after:${retryAfterSeconds}`,
    };
  }

  if (response.errorCode === 403 && /blocked/i.test(description)) {
    return { kind: "blocked", error: "telegram_bot_blocked" };
  }

  if (
    response.errorCode !== undefined &&
    response.errorCode >= 400 &&
    response.errorCode < 500
  ) {
    return {
      kind: "permanent",
      error: `telegram_permanent:${response.errorCode}:${description}`,
    };
  }

  if (response.errorCode !== undefined && response.errorCode >= 500) {
    return {
      kind: "retryable",
      error: `telegram_retryable:${response.errorCode}:${description}`,
    };
  }

  return { kind: "retryable", error: `telegram_retryable:${description}` };
}

function readRateLimit(name: string, fallback: number): number {
  const value = toPositiveInteger(process.env[name]);
  return value ?? fallback;
}

function getBucket(now: Date): number {
  return Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS);
}

function getWindowRetryAfterMs(now: Date): number {
  return RATE_LIMIT_WINDOW_MS - (now.getTime() % RATE_LIMIT_WINDOW_MS) + 25;
}

function parseScriptRateLimitResult(
  value: unknown,
): TelegramRateLimitResult | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  if (Number(value[0]) === 1) return { allowed: true };
  const scope = value[2] === "chat" ? "chat" : "global";
  const retryAfterMs = Math.max(Number(value[1]) || RATE_LIMIT_WINDOW_MS, 25);
  return { allowed: false, retryAfterMs, scope };
}

async function consumeAtomicWindows(args: {
  connection: RedisRateLimitConnection;
  globalKey: string;
  chatKey: string;
  globalLimit: number;
  chatLimit: number;
}): Promise<TelegramRateLimitResult | undefined> {
  if (!args.connection.eval) return undefined;

  const result = await args.connection.eval(
    `
local global_count = tonumber(redis.call('get', KEYS[1]) or '0')
local chat_count = tonumber(redis.call('get', KEYS[2]) or '0')
local global_limit = tonumber(ARGV[1])
local chat_limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

if global_count >= global_limit then
  local pttl = redis.call('pttl', KEYS[1])
  if pttl < 1 then pttl = ttl end
  return {0, pttl, 'global'}
end

if chat_count >= chat_limit then
  local pttl = redis.call('pttl', KEYS[2])
  if pttl < 1 then pttl = ttl end
  return {0, pttl, 'chat'}
end

global_count = redis.call('incr', KEYS[1])
chat_count = redis.call('incr', KEYS[2])
if global_count == 1 then redis.call('pexpire', KEYS[1], ttl) end
if chat_count == 1 then redis.call('pexpire', KEYS[2], ttl) end
return {1, 0, 'ok'}
    `,
    2,
    args.globalKey,
    args.chatKey,
    args.globalLimit,
    args.chatLimit,
    RATE_LIMIT_TTL_MS,
  );

  return parseScriptRateLimitResult(result);
}

async function consumeWindow(args: {
  connection: RedisRateLimitConnection;
  key: string;
  limit: number;
  now: Date;
}): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const count = await args.connection.incr(args.key);
  if (count === 1) {
    await args.connection.pexpire(args.key, RATE_LIMIT_TTL_MS);
  }
  if (count <= args.limit) return { allowed: true };

  const pttl = await args.connection.pttl?.(args.key);
  const retryAfterMs =
    typeof pttl === "number" && pttl > 0
      ? pttl
      : getWindowRetryAfterMs(args.now);
  return { allowed: false, retryAfterMs };
}

export function createRedisTelegramRateLimiter(
  connection: RedisRateLimitConnection,
): TelegramRateLimiter {
  const globalLimit = readRateLimit(
    "TELEGRAM_GLOBAL_RATE_LIMIT_PER_SEC",
    DEFAULT_GLOBAL_RATE_LIMIT_PER_SECOND,
  );
  const chatLimit = readRateLimit(
    "TELEGRAM_CHAT_RATE_LIMIT_PER_SEC",
    DEFAULT_CHAT_RATE_LIMIT_PER_SECOND,
  );

  return {
    async consume(chatId: string, now: Date): Promise<TelegramRateLimitResult> {
      const bucket = getBucket(now);
      const globalKey = `notify:telegram:global:${bucket}`;
      const chatKey = `notify:telegram:chat:${chatId}:${bucket}`;
      const atomicResult = await consumeAtomicWindows({
        connection,
        globalKey,
        chatKey,
        globalLimit,
        chatLimit,
      });
      if (atomicResult) return atomicResult;

      const global = await consumeWindow({
        connection,
        key: globalKey,
        limit: globalLimit,
        now,
      });
      if (!global.allowed) {
        return {
          allowed: false,
          retryAfterMs: global.retryAfterMs,
          scope: "global",
        };
      }

      const chat = await consumeWindow({
        connection,
        key: chatKey,
        limit: chatLimit,
        now,
      });
      if (!chat.allowed) {
        return {
          allowed: false,
          retryAfterMs: chat.retryAfterMs,
          scope: "chat",
        };
      }

      return { allowed: true };
    },
  };
}
