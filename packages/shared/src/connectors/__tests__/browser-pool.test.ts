import { describe, expect, it, vi } from "vitest";
import { ConnectorBrowserUnavailableError } from "../errors.js";
import { SimpleBrowserPool, UnavailableBrowserPool } from "../browser-pool.js";

describe("connector browser pool abstraction", () => {
  it("releases acquired pages after successful use", async () => {
    const close = vi.fn();
    const pool = new SimpleBrowserPool(async () => ({
      page: { id: "page-1" },
      close,
    }));

    const result = await pool.withPage(async (page) =>
      String((page as { id: string }).id),
    );

    expect(result).toBe("page-1");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("releases acquired pages after errors", async () => {
    const close = vi.fn();
    const pool = new SimpleBrowserPool(async () => ({
      page: { id: "page-1" },
      close,
    }));

    await expect(
      pool.withPage(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fails explicitly when browser support is unavailable", async () => {
    const pool = new UnavailableBrowserPool("playwright not configured");

    await expect(pool.withPage(async () => undefined)).rejects.toBeInstanceOf(
      ConnectorBrowserUnavailableError,
    );
  });
});
