import { Controller, Get, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/guards.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Health/readiness/liveness endpoints (§04.6 NFR-MON-3). */
@ApiTags("health")
@Public()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  health() {
    return { status: "ok", ts: new Date().toISOString() };
  }

  @Get("live")
  live() {
    return { status: "live" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      return { status: "not_ready" };
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
