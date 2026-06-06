import {
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Query,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ZodValidationPipe } from "nestjs-zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { Prisma } from "@suchewohnung/database";
import { ListingIdParamDto, ListingSearchQueryDto } from "./dto.js";

/**
 * Forward search (§10.6) — catalog with query filters + cursor pagination
 * (§08.2). Uses the same filter semantics as matching.
 */
@ApiTags("listings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/listings")
export class ListingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async search(@Query(new ZodValidationPipe(ListingSearchQueryDto)) query: ListingSearchQueryDto) {
    const take = query.limit;
    const where: Prisma.ListingWhereInput = { status: { in: ["active", "updated"] } };
    if (query.city) where.city = query.city;
    if (query.price_max !== undefined) where.price = { ...(where.price as object), lte: query.price_max };
    if (query.price_min !== undefined) where.price = { ...(where.price as object), gte: query.price_min };
    if (query.rooms_min !== undefined) where.rooms = { gte: query.rooms_min };
    if (query.area_min !== undefined) where.area = { gte: query.area_min };

    const rows = await this.prisma.listing.findMany({
      where,
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: { firstSeenAt: "desc" },
      include: { images: { orderBy: { position: "asc" } } },
    });

    const hasMore = rows.length > take;
    const data = hasMore ? rows.slice(0, take) : rows;
    return {
      data,
      page: {
        next_cursor: hasMore ? data[data.length - 1]?.id : null,
        has_more: hasMore,
      },
    };
  }

  @Get(":id")
  async detail(@Param(new ZodValidationPipe(ListingIdParamDto)) params: ListingIdParamDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: params.id },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!listing) throw new NotFoundException("Listing not found");
    return { data: listing };
  }

  @Get(":id/history")
  async history(@Param(new ZodValidationPipe(ListingIdParamDto)) params: ListingIdParamDto) {
    const data = await this.prisma.listingHistory.findMany({
      where: { listingId: params.id },
      orderBy: { changedAt: "desc" },
    });
    return { data };
  }
}

@Module({ controllers: [ListingsController] })
export class ListingsModule {}
