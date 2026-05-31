import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard } from "../auth/guards.js";

@ApiTags("filters")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/filters")
export class FiltersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Schema-driven filter metadata for dynamic UI form (§08.5, FR-FILT-3). */
  @Get()
  async list() {
    const data = await this.prisma.filterDefinition.findMany({
      where: { isActive: true },
      orderBy: { key: "asc" },
    });
    return { data };
  }
}

@Module({ controllers: [FiltersController] })
export class FiltersModule {}
