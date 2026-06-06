import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

type RefreshTokenClient = {
  refreshToken: {
    create(args: { data: { userId: string; tokenHash: string; expiresAt: Date } }): Promise<unknown>;
  };
};

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly argonMemory = Number(process.env.ARGON_MEMORY_KIB ?? 19456);
  private readonly jwtAccessTtl = process.env.JWT_ACCESS_TTL ?? "15m";
  private readonly jwtRefreshTtlDays = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async register(email: string, password: string, locale?: string): Promise<{ id: string }> {
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) throw new ConflictException("Email already registered");

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.argonMemory,
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        locale: locale ?? "de",
        status: "pending",
      },
    });

    // Issue an email verification token (FR-AUTH-2).
    const token = randomBytes(32).toString("hex");
    await this.prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        purpose: "verify_email",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    this.logger.log(`Verification token issued for ${user.id}`);
    return { id: user.id };
  }

  /** Generate a new verification token and return it (for email service). */
  async generateVerificationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.prisma.emailToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        purpose: "verify_email",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }

  /** Generate a password reset token. */
  async generatePasswordResetToken(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) return null;
    const token = randomBytes(32).toString("hex");
    await this.prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        purpose: "password_reset",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const rec = await this.prisma.emailToken.findFirst({
      where: { tokenHash: this.hashToken(token), purpose: "password_reset", usedAt: null },
    });
    if (!rec || rec.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: this.argonMemory,
    });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      this.prisma.emailToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async verifyEmail(token: string): Promise<void> {
    const rec = await this.prisma.emailToken.findFirst({
      where: { tokenHash: this.hashToken(token), purpose: "verify_email", usedAt: null },
    });
    if (!rec || rec.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: rec.userId },
        data: { status: "active", emailVerifiedAt: new Date() },
      }),
      this.prisma.emailToken.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.status === "pending") throw new UnauthorizedException("Email verification required");
    if (user.status === "suspended") throw new UnauthorizedException("Account suspended");
    if (user.status === "deleted") throw new UnauthorizedException("Invalid credentials");
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    return user;
  }

  private signAccess(user: { id: string; email: string; role: string }): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: this.jwtAccessTtl },
    );
  }

  private async issueRefresh(userId: string, client: RefreshTokenClient = this.prisma): Promise<string> {
    const token = randomBytes(48).toString("hex");
    const days = this.jwtRefreshTtlDays;
    await client.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.validateUser(email, password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      access_token: this.signAccess(user),
      refresh_token: await this.issueRefresh(user.id),
    };
  }

  /** Refresh-token rotation (§08.3, §13.1). */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = this.hashToken(refreshToken);
    const issued = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.refreshToken.findFirst({
        where: { tokenHash: hash, revokedAt: null },
        include: { user: true },
      });
      if (!rec || rec.expiresAt < new Date()) {
        throw new UnauthorizedException("Invalid refresh token");
      }
      if (rec.user.deletedAt || rec.user.status !== "active") {
        throw new UnauthorizedException("Account is not active");
      }

      const revoked = await tx.refreshToken.updateMany({
        where: { id: rec.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      return {
        user: rec.user,
        refreshToken: await this.issueRefresh(rec.userId, tx),
      };
    });

    return {
      access_token: this.signAccess(issued.user),
      refresh_token: issued.refreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
