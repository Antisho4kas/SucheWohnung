import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Patch,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";

/**
 * Self-service account (§08.5 Users) + GDPR rights (§13.4):
 * export (Art.15/20), erasure (Art.17), consents.
 */
@ApiTags("me")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/me")
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: JwtPayload) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        locale: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
    });
    return { data: u };
  }

  @Patch()
  async update(@CurrentUser() user: JwtPayload, @Body() body: { locale?: string }) {
    const u = await this.prisma.user.update({
      where: { id: user.sub },
      data: { locale: body.locale },
      select: { id: true, locale: true },
    });
    return { data: u };
  }

  /** GDPR Art.15/20 — machine-readable export of all personal data. */
  @Get("export")
  async export(@CurrentUser() user: JwtPayload) {
    const [account, profiles, subscriptions, consents, matches] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.sub } }),
      this.prisma.searchProfile.findMany({
        where: { userId: user.sub },
        include: { filters: true },
      }),
      this.prisma.telegramSubscription.findMany({ where: { userId: user.sub } }),
      this.prisma.userConsent.findMany({ where: { userId: user.sub } }),
      this.prisma.match.findMany({
        where: { profile: { userId: user.sub } },
        take: 1000,
      }),
    ]);
    return { account, profiles, subscriptions, consents, matches };
  }

  /** GDPR Art.17 — soft-delete + async erasure (§13.4 erasure flow). */
  @Delete()
  async erase(@CurrentUser() user: JwtPayload) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.sub },
        data: { status: "deleted", deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.searchProfile.updateMany({
        where: { userId: user.sub },
        data: { isActive: false },
      }),
      this.prisma.auditLog.create({
        data: { actorId: user.sub, action: "user.erasure_requested", meta: {} },
      }),
    ]);
    return { data: { status: "deletion_scheduled" } };
  }

  @Get("consents")
  async getConsents(@CurrentUser() user: JwtPayload) {
    const data = await this.prisma.userConsent.findMany({ where: { userId: user.sub } });
    return { data };
  }

  @Put("consents")
  async setConsent(
    @CurrentUser() user: JwtPayload,
    @Body() body: { consent_type: string; granted: boolean },
  ) {
    const c = await this.prisma.userConsent.create({
      data: { userId: user.sub, consentType: body.consent_type, granted: body.granted },
    });
    return { data: c };
  }
}

@Module({ controllers: [MeController] })
export class UsersModule {}
