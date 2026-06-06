import { describe, expect, it, vi } from "vitest";
import { createTelegramWorkerOptions, runTelegramUpdateJob } from "./telegram-queue-consumer";

describe("Telegram queue consumer", () => {
  it("passes queued updates to the Telegram processor", async () => {
    const update = { update_id: 1 };
    const processUpdate = vi.fn().mockResolvedValue(undefined);

    await expect(
      runTelegramUpdateJob({ data: { update } } as never, processUpdate),
    ).resolves.toBeUndefined();

    expect(processUpdate).toHaveBeenCalledWith(update);
  });

  it("rejects invalid telegram update jobs so BullMQ can retry them", async () => {
    const processUpdate = vi.fn().mockResolvedValue(undefined);

    await expect(
      runTelegramUpdateJob({ data: {} } as never, processUpdate),
    ).rejects.toThrow("Invalid Telegram update job payload");

    expect(processUpdate).not.toHaveBeenCalled();
  });

  it("processes queued Telegram updates sequentially by default", () => {
    expect(createTelegramWorkerOptions({ connection: {} }).concurrency).toBe(1);
  });
});
