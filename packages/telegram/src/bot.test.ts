import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createTelegramBot, processTelegramUpdate } from "./bot";

const now = new Date("2026-06-03T12:00:00.000Z");
const botInfo = {
  id: 123,
  is_bot: true as const,
  first_name: "SucheWohnung",
  username: "SucheWohnungBot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  can_manage_bots: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

function createPrisma(overrides: Record<string, unknown> = {}) {
  return {
    emailToken: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    telegramSubscription: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
}

function createUpdate(
  text: string,
  chat: { id?: number; type?: "private" | "group" | "supergroup" } = {},
) {
  const commandLength = text.split(" ")[0]?.length ?? text.length;
  const chatId = chat.id ?? 12345;
  const chatType = chat.type ?? "private";
  return {
    update_id: 1000,
    message: {
      message_id: 10,
      date: 1_780_489_200,
      chat: { id: chatId, type: chatType, first_name: "Mieter", title: "Wohnung Gruppe" },
      from: { id: 12345, is_bot: false, first_name: "Mieter" },
      text,
      entities: [{ type: "bot_command", offset: 0, length: commandLength }],
    },
  };
}

function createBot(prisma: ReturnType<typeof createPrisma>) {
  const sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const bot = createTelegramBot({
    token: "123:test-token",
    prisma: prisma as never,
    now: () => now,
    botInfo,
  });
  bot.api.config.use(async (_prev, method, payload) => {
    sent.push({ method, payload: payload as Record<string, unknown> });
    return {
      ok: true,
      result: {
        message_id: 99,
        date: 1_780_489_200,
        chat: { id: payload.chat_id, type: "private" },
        text: payload.text,
      },
    } as never;
  });
  return { bot, sent };
}

describe("Telegram update processor", () => {
  it("links a private Telegram chat on /start with a valid one-time token", async () => {
    const prisma = createPrisma();
    const token = "valid-token";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    prisma.emailToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-06-03T12:10:00.000Z"),
      user: { email: "user@example.com" },
    });
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate(`/start ${token}`));

    expect(prisma.emailToken.findFirst).toHaveBeenCalledWith({
      where: { tokenHash, purpose: "tg_link", usedAt: null },
    });
    expect(prisma.telegramSubscription.create).toHaveBeenCalledWith({
      data: { userId: "user-1", chatId: 12345, enabled: true },
    });
    expect(prisma.emailToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1", usedAt: null },
      data: { usedAt: now },
    });
    expect(prisma.emailToken.update).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toContain("привязан");
    expect(sent.at(-1)?.payload.text).not.toContain("user@example.com");
  });

  it("rejects /start token linking from a group chat", async () => {
    const prisma = createPrisma();
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/start valid-token", { id: -12345, type: "group" }));

    expect(prisma.emailToken.findFirst).not.toHaveBeenCalled();
    expect(prisma.emailToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.create).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.update).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Please open bot in private chat");
  });

  it("rejects /start token linking from a supergroup chat", async () => {
    const prisma = createPrisma();
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(
      bot,
      createUpdate("/start valid-token", { id: -10012345, type: "supergroup" }),
    );

    expect(prisma.emailToken.findFirst).not.toHaveBeenCalled();
    expect(prisma.emailToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.create).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.update).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Please open bot in private chat");
  });

  it("rejects a concurrently consumed /start token without linking", async () => {
    const prisma = createPrisma();
    prisma.emailToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-06-03T12:10:00.000Z"),
      user: { email: "user@example.com" },
    });
    prisma.emailToken.updateMany.mockResolvedValue({ count: 0 });
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/start raced-token"));

    expect(prisma.telegramSubscription.create).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.update).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Ссылка устарела или недействительна.");
  });

  it("rejects an expired /start token without linking", async () => {
    const prisma = createPrisma();
    prisma.emailToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      expiresAt: new Date("2026-06-03T11:59:59.000Z"),
      user: { email: "user@example.com" },
    });
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/start expired-token"));

    expect(prisma.telegramSubscription.create).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.updateMany).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Ссылка устарела или недействительна.");
  });

  it("rejects a token expiring exactly now without linking", async () => {
    const prisma = createPrisma();
    prisma.emailToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      expiresAt: now,
      user: { email: "user@example.com" },
    });
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/start boundary-token"));

    expect(prisma.telegramSubscription.create).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.updateMany).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Ссылка устарела или недействительна.");
  });

  it("rejects a used /start token without linking", async () => {
    const prisma = createPrisma();
    prisma.emailToken.findFirst.mockResolvedValue(null);
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/start used-token"));

    expect(prisma.emailToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash("sha256").update("used-token").digest("hex"),
        purpose: "tg_link",
        usedAt: null,
      },
    });
    expect(prisma.telegramSubscription.create).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.update).not.toHaveBeenCalled();
    expect(prisma.emailToken.updateMany).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Ссылка устарела или недействительна.");
  });

  it("disables the subscription for the current private chat on /stop", async () => {
    const prisma = createPrisma();
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/stop"));

    expect(prisma.telegramSubscription.updateMany).toHaveBeenCalledWith({
      where: { chatId: 12345 },
      data: { enabled: false },
    });
    expect(prisma.telegramSubscription.deleteMany).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toContain("отключены");
  });

  it("does not disable subscriptions from a non-private /stop", async () => {
    const prisma = createPrisma();
    const { bot, sent } = createBot(prisma);

    await processTelegramUpdate(bot, createUpdate("/stop", { id: -12345, type: "group" }));

    expect(prisma.telegramSubscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.telegramSubscription.deleteMany).not.toHaveBeenCalled();
    expect(sent.at(-1)?.payload.text).toBe("Please open bot in private chat");
  });

  it("initializes a bot without cached botInfo before processing webhook updates", async () => {
    const prisma = createPrisma();
    const bot = createTelegramBot({ token: "123:test-token", prisma: prisma as never });
    const init = vi.spyOn(bot, "init").mockResolvedValue(undefined);
    const handleUpdate = vi.spyOn(bot, "handleUpdate").mockResolvedValue(undefined);
    const update = { update_id: 2000 };

    await processTelegramUpdate(bot, update);

    expect(init).toHaveBeenCalledOnce();
    expect(handleUpdate).toHaveBeenCalledWith(update);
  });
});
