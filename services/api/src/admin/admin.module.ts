import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard, RolesGuard } from "../auth/guards.js";
import { Roles } from "../auth/roles.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { QueueService } from "../queue/queue.service.js";

/**
 * Admin Panel API (§08.5 /admin, §12). Guarded by RBAC (admin+).
 * All admin actions are written to audit_logs (§12.8 / A.8).
 */
@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("api/v1/admin")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  private async audit(actorId: string, action: string, meta: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { actorId, action, meta: meta as object } });
  }

  // ---- Users (FR-ADM-1) ----
  @Get("users")
  async users(@Query("q") q?: string, @Query("limit") limit = "50") {
    const data = await this.prisma.user.findMany({
      where: q ? { email: { contains: q, mode: "insensitive" } } : undefined,
      take: Math.min(Number(limit) || 50, 200),
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, status: true, createdAt: true },
    });
    return { data };
  }

  @Patch("users/:id")
  async updateUser(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() body: { role?: string; status?: string },
  ) {
    const u = await this.prisma.user.update({
      where: { id },
      data: {
        role: body.role as never,
        status: body.status as never,
      },
      select: { id: true, role: true, status: true },
    });
    await this.audit(actor.sub, "admin.user.update", { targetUserId: id, ...body });
    return { data: u };
  }

  // ---- Sources (FR-ADM-2) ----
  @Get("sources")
  async sources() {
    const data = await this.prisma.source.findMany({ orderBy: { createdAt: "asc" } });
    return { data };
  }

  @Post("sources")
  async createSource(@CurrentUser() actor: JwtPayload, @Body() body: Record<string, unknown>) {
    const s = await this.prisma.source.create({
      data: {
        slug: String(body.slug),
        name: String(body.name),
        integrationType: (body.integration_type as never) ?? "scrape",
        scheduleCron: (body.schedule_cron as string) ?? "*/15 * * * *",
        rateLimitRpm: (body.rate_limit_rpm as number) ?? 30,
        config: (body.config as object) ?? {},
      },
    });
    await this.audit(actor.sub, "admin.source.create", { sourceId: s.id, slug: s.slug });
    return { data: s };
  }

  @Patch("sources/:id")
  async updateSource(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const s = await this.prisma.source.update({
      where: { id },
      data: {
        name: body.name as string | undefined,
        scheduleCron: body.schedule_cron as string | undefined,
        rateLimitRpm: body.rate_limit_rpm as number | undefined,
        config: body.config as object | undefined,
      },
    });
    await this.audit(actor.sub, "admin.source.update", { sourceId: id });
    return { data: s };
  }

  @Post("sources/:id/toggle")
  async toggleSource(@CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    const cur = await this.prisma.source.findUniqueOrThrow({ where: { id } });
    const s = await this.prisma.source.update({
      where: { id },
      data: { isActive: !cur.isActive },
    });
    await this.audit(actor.sub, "admin.source.toggle", { sourceId: id, isActive: s.isActive });
    return { data: { id: s.id, is_active: s.isActive } };
  }

  /** Manual run trigger (§08.5 /admin/sources/:id/run, FR-ADM-2). */
  @Post("sources/:id/run")
  async runSource(@CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    const src = await this.prisma.source.findUniqueOrThrow({ where: { id } });
    await this.queue.enqueueCollect(src.slug);
    await this.audit(actor.sub, "admin.source.run", { sourceId: id });
    return { data: { enqueued: true, source: src.slug } };
  }

  @Get("sources/:id/runs")
  async runs(@Param("id") id: string) {
    const data = await this.prisma.sourceRun.findMany({
      where: { sourceId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return { data };
  }

  // ---- Queues (FR-ADM-5) ----
  @Get("queues")
  async queues() {
    return { data: await this.queue.getCounts() };
  }

  @Post("queues/:name/retry")
  async retry(@CurrentUser() actor: JwtPayload, @Param("name") name: string) {
    const n = await this.queue.retryFailed(name);
    await this.audit(actor.sub, "admin.queue.retry", { queue: name, retried: n });
    return { data: { retried: n } };
  }

  // ---- Stats (FR-ADM-7) ----
  @Get("stats")
  async stats() {
    const [users, profiles, listings, matches, notifications] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.searchProfile.count({ where: { isActive: true } }),
      this.prisma.listing.count(),
      this.prisma.match.count(),
      this.prisma.notification.count({ where: { status: "sent" } }),
    ]);
    return { data: { users, active_profiles: profiles, listings, matches, notifications } };
  }

  // ---- Filters (FR-ADM-7) ----
  @Get("filters")
  async listFilters() {
    const data = await this.prisma.filterDefinition.findMany({ orderBy: { key: "asc" } });
    return { data };
  }

  @Post("filters")
  async createFilter(@CurrentUser() actor: JwtPayload, @Body() body: Record<string, unknown>) {
    const f = await this.prisma.filterDefinition.create({
      data: {
        key: String(body.key),
        label: (body.label as object) ?? {},
        dataType: String(body.data_type),
        operatorSet: (body.operator_set as string[]) ?? [],
        config: (body.config as object) ?? {},
        isActive: (body.is_active as boolean) ?? true,
      },
    });
    await this.audit(actor.sub, "admin.filter.create", { filterKey: f.key });
    return { data: f };
  }

  @Patch("filters/:id")
  async updateFilter(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const f = await this.prisma.filterDefinition.update({
      where: { id },
      data: {
        label: body.label as object | undefined,
        dataType: body.data_type as string | undefined,
        operatorSet: body.operator_set as string[] | undefined,
        config: body.config as object | undefined,
        isActive: body.is_active as boolean | undefined,
      },
    });
    await this.audit(actor.sub, "admin.filter.update", { filterId: id });
    return { data: f };
  }

  // ---- Logs (FR-ADM-4) — audit log surface; technical logs live in Loki. ----
  @Get("logs")
  async logs(@Query("limit") limit = "100") {
    const data = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 100, 500),
    });
    return { data };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
