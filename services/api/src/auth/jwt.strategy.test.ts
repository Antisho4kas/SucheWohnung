import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { JwtStrategy } from "./jwt.strategy";

function createStrategy(user: unknown) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  };
  return { strategy: new JwtStrategy(prisma as never), prisma };
}

describe("JwtStrategy database re-check", () => {
  it("returns the current database role instead of trusting stale JWT claims", async () => {
    const { strategy, prisma } = createStrategy({
      id: "user-1",
      email: "current@example.com",
      role: "user",
      status: "active",
      deletedAt: null,
    });

    await expect(
      strategy.validate({ sub: "user-1", email: "old@example.com", role: "admin" }),
    ).resolves.toEqual({
      sub: "user-1",
      email: "current@example.com",
      role: "user",
      status: "active",
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true, email: true, role: true, status: true, deletedAt: true },
    });
  });

  it.each(["pending", "suspended", "deleted"])(
    "rejects old tokens for %s users",
    async (status) => {
      const { strategy } = createStrategy({
        id: "user-1",
        email: "current@example.com",
        role: "user",
        status,
        deletedAt: status === "deleted" ? new Date() : null,
      });

      await expect(
        strategy.validate({ sub: "user-1", email: "old@example.com", role: "user" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it("rejects tokens for users that no longer exist", async () => {
    const { strategy } = createStrategy(null);

    await expect(
      strategy.validate({ sub: "user-1", email: "old@example.com", role: "user" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
