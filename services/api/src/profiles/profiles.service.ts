import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  buildCriteria,
  validateProfileFilters,
  type ProfileFilter,
} from "@suchewohnung/shared";
import type { CreateProfileDto, UpdateProfileDto } from "./dto.js";

interface FilterInput {
  key: string;
  operator: string;
  value?: unknown;
}

interface ValidatedFilters {
  readonly filters: readonly ProfileFilter[];
  readonly filterDefIds: ReadonlyMap<string, string>;
}

@Injectable()
export class ProfilesService {
  private readonly freeLimit = Number(process.env.FREE_PROFILE_LIMIT ?? 3);
  private readonly premiumLimit = Number(
    process.env.PREMIUM_PROFILE_LIMIT ?? 20,
  );

  constructor(private readonly prisma: PrismaService) {}

  /** Validate filters against the registry + semantic rules (FR-FILT-1/3/5). */
  private async validateFilters(
    filters: FilterInput[],
  ): Promise<ValidatedFilters> {
    const defs = await this.prisma.filterDefinition.findMany({
      where: { isActive: true },
    });
    const validation = validateProfileFilters(filters as ProfileFilter[], defs);
    if (!validation.success) {
      throw new BadRequestException({
        message: "Invalid profile filters",
        details: validation.errors,
      });
    }
    return {
      filters: validation.filters,
      filterDefIds: new Map(defs.map((d) => [d.key, d.id])),
    };
  }

  async create(userId: string, dto: CreateProfileDto) {
    const validated = await this.validateFilters(dto.filters);

    // BR-3: enforce per-plan profile limit.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const count = await this.prisma.searchProfile.count({ where: { userId } });
    const limit =
      user.role === "premium" ||
      user.role === "admin" ||
      user.role === "super_admin"
        ? this.premiumLimit
        : this.freeLimit;
    if (count >= limit) {
      throw new ForbiddenException(`Profile limit reached (${limit})`);
    }

    const criteria = buildCriteria(validated.filters);

    return this.prisma.searchProfile.create({
      data: {
        userId,
        name: dto.name,
        notify: dto.notify ?? true,
        criteria: criteria as object,
        filters: {
          create: validated.filters.map((f) => ({
            filterDefId: validated.filterDefIds.get(f.key)!,
            operator: f.operator,
            value: (f.value ?? null) as object,
          })),
        },
      },
      include: { filters: true },
    });
  }

  async list(userId: string) {
    return this.prisma.searchProfile.findMany({
      where: { userId },
      include: { filters: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(userId: string, id: string) {
    const profile = await this.prisma.searchProfile.findUnique({
      where: { id },
      include: { filters: true },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    if (profile.userId !== userId) throw new ForbiddenException();
    return profile;
  }

  async update(userId: string, id: string, dto: UpdateProfileDto) {
    await this.get(userId, id);
    const validated = dto.filters
      ? await this.validateFilters(dto.filters)
      : undefined;

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.notify !== undefined) data.notify = dto.notify;
    if (dto.is_active !== undefined) data.isActive = dto.is_active;

    if (dto.filters) {
      data.criteria = buildCriteria(validated!.filters) as object;
      await this.prisma.profileFilter.deleteMany({ where: { profileId: id } });
      await this.prisma.profileFilter.createMany({
        data: validated!.filters.map((f) => ({
          profileId: id,
          filterDefId: validated!.filterDefIds.get(f.key)!,
          operator: f.operator,
          value: (f.value ?? null) as object,
        })),
      });
    }

    return this.prisma.searchProfile.update({
      where: { id },
      data,
      include: { filters: true },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.searchProfile.delete({ where: { id } });
  }

  async toggle(userId: string, id: string) {
    const profile = await this.get(userId, id);
    return this.prisma.searchProfile.update({
      where: { id },
      data: { notify: !profile.notify },
      include: { filters: true },
    });
  }

  async matches(userId: string, id: string) {
    await this.get(userId, id);
    return this.prisma.match.findMany({
      where: { profileId: id },
      include: { listing: { include: { images: true } } },
      orderBy: { matchedAt: "desc" },
      take: 100,
    });
  }
}
