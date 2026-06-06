import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Prisma } from "@suchewohnung/database";
import { ZodValidationPipe } from "nestjs-zod";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  JwtAuthGuard,
  RolesGuard,
  SuperAdminMutation,
  SuperAdminMutationGuard,
} from "../auth/guards.js";
import { Roles } from "../auth/roles.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";
import { isSuperAdminMutationsEnabled } from "../config/configuration.js";
import {
  QUEUE_NAMES,
  QueueService,
  type QueueName,
} from "../queue/queue.service.js";
import {
  getSourceActivationDecision,
  getSourceLifecycleConfig,
  isDefaultConnectorRegistered,
} from "@suchewohnung/shared";
import {
  AdminCreateFilterDto,
  AdminCreateSourceDto,
  AdminLogsQueryDto,
  AdminUpdateFilterDto,
  AdminUpdateSourceDto,
  AdminUpdateUserDto,
  AdminUsersQueryDto,
} from "./dto.js";

type SourceRunDtoInput = {
  id: string;
  sourceId?: string;
  source_id?: string;
  status?: string;
  itemsFetched?: number;
  items_fetched?: number;
  itemsNew?: number;
  items_new?: number;
  itemsUpdated?: number;
  items_updated?: number;
  errors?: number;
  startedAt?: Date | string;
  started_at?: Date | string;
  finishedAt?: Date | string | null;
  finished_at?: Date | string | null;
};

type SourceDtoInput = {
  id: string;
  slug?: string;
  name?: string;
  isActive?: boolean;
  is_active?: boolean;
  enabled?: boolean;
  breakerState?: string | null;
  breaker_state?: string | null;
  config?: unknown;
  listings_count?: number;
  _count?: { listings?: number };
  runs?: SourceRunDtoInput[];
};

type AuditLogDtoInput = {
  id: string;
  actorId?: string | null;
  actor_id?: string | null;
  userEmail?: string | null;
  user_email?: string | null;
  actor?: { email?: string | null } | null;
  action?: string;
  meta?: unknown;
  details?: unknown;
  createdAt?: Date | string;
  created_at?: Date | string;
};

type QueueCounts = {
  waiting?: unknown;
  wait?: unknown;
  active?: unknown;
  delayed?: unknown;
  failed?: unknown;
  completed?: unknown;
  depth?: unknown;
};

const PROTECTED_SOURCE_CONFIG_KEYS = new Set([
  "activationApproved",
  "activation_approved",
  "activationBlockReason",
  "activation_block_reason",
  "lifecycleStatus",
  "lifecycle_status",
]);

const QUEUE_NAME_SET = new Set<string>(QUEUE_NAMES);

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
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(QueueService)
    private readonly queue: QueueService,
  ) {}

  private async audit(
    actorId: string,
    action: string,
    meta: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { actorId, action, meta: meta as object },
    });
  }

  private dateDto(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    return value instanceof Date ? value.toISOString() : value;
  }

  private numberDto(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private sourceRunDto(run: SourceRunDtoInput) {
    return {
      id: run.id,
      source_id: run.source_id ?? run.sourceId ?? "",
      status: run.status ?? "",
      items_fetched: this.numberDto(run.items_fetched ?? run.itemsFetched),
      items_new: this.numberDto(run.items_new ?? run.itemsNew),
      items_updated: this.numberDto(run.items_updated ?? run.itemsUpdated),
      errors: this.numberDto(run.errors),
      started_at: this.dateDto(run.started_at ?? run.startedAt),
      finished_at: this.dateDto(run.finished_at ?? run.finishedAt),
    };
  }

  private sourceHealth(
    isActive: boolean,
    breakerState: string,
    lastRun: ReturnType<AdminController["sourceRunDto"]> | null,
  ): "healthy" | "degraded" | "failing" | "paused" | "unknown" {
    if (!isActive) return "paused";
    if (breakerState === "open") return "failing";
    if (breakerState === "half_open") return "degraded";
    if (!lastRun) return "unknown";
    if (lastRun.status === "failed") return "failing";
    if (lastRun.status === "partial" || lastRun.errors > 0) return "degraded";
    if (lastRun.status === "success") return "healthy";
    return "unknown";
  }

  private sourceDto(source: SourceDtoInput) {
    const isActive =
      source.is_active ?? source.isActive ?? source.enabled ?? false;
    const breakerState =
      source.breaker_state ?? source.breakerState ?? "closed";
    const lastRun = source.runs?.[0] ? this.sourceRunDto(source.runs[0]) : null;
    const slug = source.slug ?? "";
    const activation = getSourceActivationDecision({
      sourceSlug: slug,
      config: source.config,
      isRegistered: isDefaultConnectorRegistered(slug),
    });
    return {
      id: source.id,
      slug,
      name: source.name ?? slug,
      is_active: isActive,
      enabled: isActive,
      breaker_state: breakerState,
      registered: isDefaultConnectorRegistered(slug),
      lifecycle_status: activation.lifecycleStatus,
      activation_approved: activation.activationApproved,
      activation_block_reason: activation.activationBlockReason ?? null,
      activatable: activation.activatable,
      activation_block_reasons: activation.reasons,
      health: this.sourceHealth(isActive, breakerState, lastRun),
      listings_count: source.listings_count ?? source._count?.listings ?? 0,
      last_run_status: lastRun?.status ?? null,
      items_fetched: lastRun?.items_fetched ?? 0,
      items_new: lastRun?.items_new ?? 0,
      items_updated: lastRun?.items_updated ?? 0,
      errors: lastRun?.errors ?? 0,
      last_run: lastRun,
    };
  }

  private auditDetailsDto(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private auditLogDto(log: AuditLogDtoInput) {
    const meta = log.meta ?? {};
    return {
      id: log.id,
      actor_id: log.actor_id ?? log.actorId ?? null,
      user_email: log.user_email ?? log.userEmail ?? log.actor?.email ?? null,
      action: log.action ?? "",
      meta,
      details: this.auditDetailsDto(log.details ?? meta),
      created_at: this.dateDto(log.created_at ?? log.createdAt) ?? "",
    };
  }

  private sourceConfigWithLifecycle(
    config: unknown,
    lifecycleSource?: unknown,
  ): Record<string, unknown> {
    const current =
      config && typeof config === "object" && !Array.isArray(config)
        ? (config as Record<string, unknown>)
        : {};
    const lifecycle = getSourceLifecycleConfig(lifecycleSource);
    const sanitized = Object.fromEntries(
      Object.entries(current).filter(
        ([key]) => !PROTECTED_SOURCE_CONFIG_KEYS.has(key),
      ),
    );
    return {
      ...sanitized,
      lifecycleStatus: lifecycle.lifecycleStatus,
      activationApproved: lifecycle.activationApproved,
      ...(lifecycle.activationBlockReason
        ? { activationBlockReason: lifecycle.activationBlockReason }
        : {}),
    };
  }

  private assertSourceActivationAllowed(source: {
    slug: string;
    config: unknown;
  }): void {
    const decision = getSourceActivationDecision({
      sourceSlug: source.slug,
      config: source.config,
      isRegistered: isDefaultConnectorRegistered(source.slug),
    });
    if (!decision.activatable) {
      throw new ConflictException(decision.reasons.join("; "));
    }
  }

  private assertNoSourceActivationMetadata(config: unknown): void {
    if (!config || typeof config !== "object" || Array.isArray(config)) return;
    const protectedKey = Object.keys(config).find((key) =>
      PROTECTED_SOURCE_CONFIG_KEYS.has(key),
    );
    if (protectedKey) {
      throw new ConflictException(
        `Source lifecycle metadata "${protectedKey}" is managed outside generic source config`,
      );
    }
  }

  private queueCountsDto(counts: QueueCounts = {}) {
    const waiting = this.numberDto(counts.waiting ?? counts.wait);
    const active = this.numberDto(counts.active);
    const delayed = this.numberDto(counts.delayed);
    return {
      waiting,
      active,
      delayed,
      failed: this.numberDto(counts.failed),
      completed: this.numberDto(counts.completed),
      depth: this.numberDto(counts.depth ?? waiting),
    };
  }

  private queuesDto(raw: Record<string, unknown>) {
    return Object.fromEntries(
      QUEUE_NAMES.map((name) => [
        name,
        this.queueCountsDto(raw[name] as QueueCounts),
      ]),
    ) as Record<QueueName, ReturnType<AdminController["queueCountsDto"]>>;
  }

  private isQueueName(name: string): name is QueueName {
    return QUEUE_NAME_SET.has(name);
  }

  // ---- Users (FR-ADM-1) ----
  @Get("users")
  async users(
    @Query(new ZodValidationPipe(AdminUsersQueryDto)) query: AdminUsersQueryDto,
  ) {
    const data = await this.prisma.user.findMany({
      where: query.q
        ? { email: { contains: query.q, mode: "insensitive" } }
        : undefined,
      take: query.limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    return { data };
  }

  @Patch("users/:id")
  @SuperAdminMutation()
  @UseGuards(SuperAdminMutationGuard)
  async updateUser(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminUpdateUserDto)) body: AdminUpdateUserDto,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new NotFoundException("User not found");

    this.assertAdminUserUpdateAllowed(actor, target, body);

    const where: Prisma.UserWhereInput = { id };
    if (!(actor.role === "super_admin" && isSuperAdminMutationsEnabled())) {
      where.role = { not: "super_admin" };
    }

    const updated = await this.prisma.user.updateMany({
      where,
      data: {
        role: body.role as never,
        status: body.status as never,
      },
    });
    if (updated.count !== 1) {
      throw new ForbiddenException("super_admin role is required");
    }

    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, role: true, status: true },
    });
    await this.audit(actor.sub, "admin.user.update", {
      targetUserId: id,
      ...body,
    });
    return { data: u };
  }

  private assertAdminUserUpdateAllowed(
    actor: JwtPayload,
    target: { id: string; role: string; status: string },
    body: AdminUpdateUserDto,
  ): void {
    if (body.role !== undefined && actor.sub === target.id) {
      throw new ForbiddenException("Admins cannot change their own role");
    }

    const touchesSuperAdmin =
      target.role === "super_admin" || body.role === "super_admin";
    if (!touchesSuperAdmin) return;

    if (actor.role !== "super_admin") {
      throw new ForbiddenException("super_admin role is required");
    }
    if (!isSuperAdminMutationsEnabled()) {
      throw new ForbiddenException(
        "Super-admin mutations are disabled for beta",
      );
    }
  }

  // ---- Sources (FR-ADM-2) ----
  @Get("sources")
  async sources() {
    const rows = await this.prisma.source.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { listings: true } },
        runs: {
          where: { finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });
    return { data: rows.map((source) => this.sourceDto(source)) };
  }

  @Post("sources")
  async createSource(
    @CurrentUser() actor: JwtPayload,
    @Body(new ZodValidationPipe(AdminCreateSourceDto))
    body: AdminCreateSourceDto,
  ) {
    this.assertNoSourceActivationMetadata(body.config);
    const s = await this.prisma.source.create({
      data: {
        slug: body.slug,
        name: body.name,
        integrationType: body.integration_type as never,
        scheduleCron: body.schedule_cron,
        rateLimitRpm: body.rate_limit_rpm,
        config: this.sourceConfigWithLifecycle(body.config) as object,
      },
      include: {
        _count: { select: { listings: true } },
        runs: {
          where: { finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });
    await this.audit(actor.sub, "admin.source.create", {
      sourceId: s.id,
      slug: s.slug,
    });
    return { data: this.sourceDto(s) };
  }

  @Patch("sources/:id")
  async updateSource(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminUpdateSourceDto))
    body: AdminUpdateSourceDto,
  ) {
    const current = await this.prisma.source.findUniqueOrThrow({
      where: { id },
    });
    this.assertNoSourceActivationMetadata(body.config);
    const nextActive = body.is_active ?? body.enabled ?? current.isActive;
    const nextConfig = body.config
      ? this.sourceConfigWithLifecycle(body.config, current.config)
      : current.config;

    if (nextActive) {
      this.assertSourceActivationAllowed({
        slug: current.slug,
        config: nextConfig,
      });
    }

    const s = await this.prisma.source.update({
      where: { id },
      data: {
        name: body.name,
        isActive: body.is_active ?? body.enabled,
        scheduleCron: body.schedule_cron,
        rateLimitRpm: body.rate_limit_rpm,
        config: body.config ? (nextConfig as object) : undefined,
      },
      include: {
        _count: { select: { listings: true } },
        runs: {
          where: { finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });
    await this.audit(actor.sub, "admin.source.update", { sourceId: id });
    return { data: this.sourceDto(s) };
  }

  @Post("sources/:id/toggle")
  async toggleSource(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
  ) {
    const cur = await this.prisma.source.findUniqueOrThrow({ where: { id } });
    if (!cur.isActive) {
      this.assertSourceActivationAllowed(cur);
    }
    const s = await this.prisma.source.update({
      where: { id },
      data: { isActive: !cur.isActive },
      include: {
        _count: { select: { listings: true } },
        runs: {
          where: { finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });
    await this.audit(actor.sub, "admin.source.toggle", {
      sourceId: id,
      isActive: s.isActive,
    });
    return { data: this.sourceDto(s) };
  }

  /** Manual run trigger (§08.5 /admin/sources/:id/run, FR-ADM-2). */
  @Post("sources/:id/run")
  async runSource(@CurrentUser() actor: JwtPayload, @Param("id") id: string) {
    const src = await this.prisma.source.findUniqueOrThrow({ where: { id } });
    if (!src.isActive) {
      throw new ConflictException("Source must be active before manual run");
    }
    this.assertSourceActivationAllowed(src);
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
    return { data: data.map((run) => this.sourceRunDto(run)) };
  }

  // ---- Queues (FR-ADM-5) ----
  @Get("queues")
  async queues() {
    return { data: this.queuesDto(await this.queue.getCounts()) };
  }

  @Post("queues/:name/retry")
  async retry(@CurrentUser() actor: JwtPayload, @Param("name") name: string) {
    if (!this.isQueueName(name)) {
      throw new BadRequestException(`Unknown queue: ${name}`);
    }
    const n = await this.queue.retryFailed(name);
    await this.audit(actor.sub, "admin.queue.retry", {
      queue: name,
      retried: n,
    });
    return { data: { retried: n } };
  }

  // ---- Stats (FR-ADM-7) ----
  @Get("stats")
  async stats() {
    const [users, profiles, listings, matches, notifications] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.searchProfile.count({ where: { isActive: true } }),
        this.prisma.listing.count(),
        this.prisma.match.count(),
        this.prisma.notification.count({ where: { status: "sent" } }),
      ]);
    return {
      data: {
        users,
        active_profiles: profiles,
        listings,
        matches,
        notifications,
      },
    };
  }

  // ---- Filters (FR-ADM-7) ----
  @Get("filters")
  async listFilters() {
    const data = await this.prisma.filterDefinition.findMany({
      orderBy: { key: "asc" },
    });
    return { data };
  }

  @Post("filters")
  async createFilter(
    @CurrentUser() actor: JwtPayload,
    @Body(new ZodValidationPipe(AdminCreateFilterDto))
    body: AdminCreateFilterDto,
  ) {
    const f = await this.prisma.filterDefinition.create({
      data: {
        key: body.key,
        label: body.label as object,
        dataType: body.data_type,
        operatorSet: body.operator_set,
        config: body.config as object,
        isActive: body.is_active,
      },
    });
    await this.audit(actor.sub, "admin.filter.create", { filterKey: f.key });
    return { data: f };
  }

  @Patch("filters/:id")
  async updateFilter(
    @CurrentUser() actor: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminUpdateFilterDto))
    body: AdminUpdateFilterDto,
  ) {
    const f = await this.prisma.filterDefinition.update({
      where: { id },
      data: {
        label: body.label as object | undefined,
        dataType: body.data_type,
        operatorSet: body.operator_set,
        config: body.config as object | undefined,
        isActive: body.is_active,
      },
    });
    await this.audit(actor.sub, "admin.filter.update", { filterId: id });
    return { data: f };
  }

  // ---- Logs (FR-ADM-4) — audit log surface; technical logs live in Loki. ----
  @Get("logs")
  async logs(
    @Query(new ZodValidationPipe(AdminLogsQueryDto)) query: AdminLogsQueryDto,
  ) {
    const data = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: {
        id: true,
        actorId: true,
        action: true,
        meta: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    });
    return { data: data.map((log) => this.auditLogDto(log)) };
  }
}

@Module({
  controllers: [AdminController],
  providers: [SuperAdminMutationGuard],
})
export class AdminModule {}
