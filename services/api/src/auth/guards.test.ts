import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuperAdminMutationGuard } from "./guards";

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createGuard({
  enabled = true,
  targetRole = "user",
}: {
  enabled?: boolean;
  targetRole?: string | null;
} = {}) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(enabled),
  };
  const prisma = {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(targetRole ? { role: targetRole } : null),
    },
  };
  return { guard: new SuperAdminMutationGuard(reflector as never, prisma as never), prisma };
}

describe("SuperAdminMutationGuard", () => {
  const originalFlag = process.env.SUPER_ADMIN_MUTATIONS_ENABLED;

  afterEach(() => {
    vi.clearAllMocks();
    if (originalFlag === undefined) delete process.env.SUPER_ADMIN_MUTATIONS_ENABLED;
    else process.env.SUPER_ADMIN_MUTATIONS_ENABLED = originalFlag;
  });

  it("ignores routes that are not marked as super-admin mutations", async () => {
    const { guard, prisma } = createGuard({ enabled: false, targetRole: "super_admin" });

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "admin-1", role: "admin" },
          body: { role: "super_admin" },
          params: { id: "target-1" },
        }),
      ),
    ).resolves.toBe(true);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("allows regular admin updates that do not touch super_admin users", async () => {
    const { guard, prisma } = createGuard({ targetRole: "user" });

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "admin-1", role: "admin" },
          body: { status: "suspended" },
          params: { id: "target-1" },
        }),
      ),
    ).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "target-1" },
      select: { role: true },
    });
  });

  it("blocks regular admins from assigning super_admin", async () => {
    const { guard, prisma } = createGuard();

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "admin-1", role: "admin" },
          body: { role: "super_admin" },
          params: { id: "target-1" },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("blocks regular admins from mutating existing super_admin users", async () => {
    const { guard } = createGuard({ targetRole: "super_admin" });

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "admin-1", role: "admin" },
          body: { status: "suspended" },
          params: { id: "target-1" },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks super_admin mutations in beta unless explicitly enabled", async () => {
    delete process.env.SUPER_ADMIN_MUTATIONS_ENABLED;
    const { guard } = createGuard();

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "root-1", role: "super_admin" },
          body: { role: "super_admin" },
          params: { id: "target-1" },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows explicit super_admin mutations when the beta flag is enabled", async () => {
    process.env.SUPER_ADMIN_MUTATIONS_ENABLED = "true";
    const { guard } = createGuard();

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "root-1", role: "super_admin" },
          body: { role: "super_admin" },
          params: { id: "target-1" },
        }),
      ),
    ).resolves.toBe(true);
  });

  it("fails closed when a marked route has no inspectable target", async () => {
    process.env.SUPER_ADMIN_MUTATIONS_ENABLED = "true";
    const { guard, prisma } = createGuard();

    await expect(
      guard.canActivate(
        createContext({
          user: { sub: "admin-1", role: "admin" },
          body: { status: "suspended" },
          params: {},
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
