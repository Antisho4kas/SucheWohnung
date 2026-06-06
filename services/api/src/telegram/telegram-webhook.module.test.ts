import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi, afterEach } from "vitest";
import { TelegramWebhookController } from "./telegram-webhook.module";

function createController() {
  const queue = { enqueueTelegramUpdate: vi.fn().mockResolvedValue(undefined) };
  const processor = { process: vi.fn().mockResolvedValue(undefined) };
  return {
    controller: new TelegramWebhookController(queue as never, processor as never),
    queue,
    processor,
  };
}

describe("TelegramWebhookController", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests with an invalid webhook secret before processing", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected-secret");
    const { controller, queue, processor } = createController();

    await expect(
      controller.webhook("wrong-secret", { body: { update_id: 1 } } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(queue.enqueueTelegramUpdate).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it("rejects webhook requests when no secret is configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const { controller, queue, processor } = createController();

    await expect(
      controller.webhook(undefined, { body: { update_id: 1 } } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(queue.enqueueTelegramUpdate).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it("enqueues webhook updates by default", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected-secret");
    const update = { update_id: 1 };
    const { controller, queue, processor } = createController();

    await expect(
      controller.webhook("expected-secret", { body: update } as never),
    ).resolves.toEqual({ ok: true });

    expect(queue.enqueueTelegramUpdate).toHaveBeenCalledWith(update);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it("processes webhook updates directly when configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected-secret");
    vi.stubEnv("TELEGRAM_WEBHOOK_PROCESSING", "direct");
    const update = { update_id: 1 };
    const { controller, queue, processor } = createController();

    await expect(
      controller.webhook("expected-secret", { body: update } as never),
    ).resolves.toEqual({ ok: true });

    expect(processor.process).toHaveBeenCalledWith(update);
    expect(queue.enqueueTelegramUpdate).not.toHaveBeenCalled();
  });
});
