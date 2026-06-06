import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";

vi.mock("argon2", () => ({
  verify: vi.fn(),
  hash: vi.fn(),
}));

function createService(user: { id: string; email: string; role: string; status: string; passwordHash: string } | null) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    },
    refreshToken: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const jwt = { sign: vi.fn().mockReturnValue("access-token") };
  return { service: new AuthService(prisma as never, jwt as never), prisma, jwt };
}

function createRefreshService(updateManyCount = 1) {
  const rec = {
    id: "refresh-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "user-1",
      email: "active@example.com",
      role: "user",
      status: "active",
      deletedAt: null,
    },
  };
  const prisma = {
    refreshToken: {
      findFirst: vi.fn().mockResolvedValue(rec),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn) => fn(prisma)),
  };
  const jwt = { sign: vi.fn().mockReturnValue("access-token") };
  return { service: new AuthService(prisma as never, jwt as never), prisma, jwt };
}

describe("AuthService login security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not issue tokens for pending users", async () => {
    const verify = vi.mocked(argon2.verify).mockResolvedValue(true as never);
    const { service, prisma, jwt } = createService({
      id: "user-1",
      email: "pending@example.com",
      role: "user",
      status: "pending",
      passwordHash: "hash",
    });

    await expect(service.login("pending@example.com", "correct-password")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(verify).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it("issues tokens for active users", async () => {
    vi.mocked(argon2.verify).mockResolvedValue(true as never);
    const { service, prisma, jwt } = createService({
      id: "user-1",
      email: "active@example.com",
      role: "user",
      status: "active",
      passwordHash: "hash",
    });

    await expect(service.login("active@example.com", "correct-password")).resolves.toEqual({
      access_token: "access-token",
      refresh_token: expect.any(String),
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "user-1", email: "active@example.com", role: "user" },
      { expiresIn: expect.any(String) },
    );
  });
});

describe("AuthService refresh rotation security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes and creates refresh tokens inside one transaction", async () => {
    const { service, prisma, jwt } = createRefreshService();

    await expect(service.refresh("refresh-token")).resolves.toEqual({
      access_token: "access-token",
      refresh_token: expect.any(String),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "refresh-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: "user-1", email: "active@example.com", role: "user" },
      { expiresIn: expect.any(String) },
    );
  });

  it("rejects concurrent refresh attempts after the token is already spent", async () => {
    const { service, prisma, jwt } = createRefreshService(0);

    await expect(service.refresh("refresh-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});
