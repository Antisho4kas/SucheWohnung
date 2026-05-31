import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { loadConfig } from "./config/configuration.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { QueueModule } from "./queue/queue.service.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthGuard, RolesGuard } from "./auth/guards.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { FiltersModule } from "./filters/filters.module.js";
import { ListingsModule } from "./listings/listings.module.js";
import { UsersModule } from "./users/users.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { HealthModule } from "./health/health.module.js";
import { TelegramWebhookModule } from "./telegram/telegram-webhook.module.js";
import { RequestIdMiddleware } from "./common/request-id.middleware.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    MetricsModule,
    AuthModule,
    ProfilesModule,
    FiltersModule,
    ListingsModule,
    UsersModule,
    NotificationsModule,
    AdminModule,
    HealthModule,
    TelegramWebhookModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
