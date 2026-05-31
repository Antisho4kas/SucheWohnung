import {
  Controller,
  Get,
  Module,
  Param,
  Query,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { Prisma } from "@suchewohnung/database";

/**
 * Forward search (§10.6) — catalog with query filters + cursor pagination
 * (§08.2). Uses the same filter semantics as matching.
 */
@ApiTags("listings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/listings")
export class ListingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(
    @Query("city") city?: string,
    @Query("price_max") priceMax?: string,
    @Query("price_min") priceMin?: string,
    @Query("rooms_min") roomsMin?: string,
    @Query("area_min") areaMin?: string,
    @Query("limit") limit = "20",
    @Query("cursor") cursor?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const where: Prisma.ListingWhereInput = { status: { in: ["active", "updated"] } };
    if (city) where.city = city;
    if (priceMax) where.price = { ...(where.price as object), lte: Number(priceMax) };
    if (priceMin) where.price = { ...(where.price as object), gte: Number(priceMin) };
    if (roomsMin) where.rooms = { gte: Number(roomsMin) };
    if (areaMin) where.area = { gte: Number(areaMin) };

    const rows = await this.prisma.listing.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
  async detail(@Param("id") id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { images: { orderBy: { position: "asc" } } },
    });
    if (!listing) throw new NotFoundException("Listing not found");
    return { data: listing };
  }

  @Get(":id/history")
  async history(@Param("id") id: string) {
    const data = await this.prisma.listingHistory.findMany({
      where: { listingId: id },
      orderBy: { changedAt: "desc" },
    });
    return { data };
  }
}

@Module({ controllers: [ListingsController] })
export class ListingsModule {}
