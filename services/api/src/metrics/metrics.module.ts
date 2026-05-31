import { Controller, Get, Global, Module, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/guards.js";
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";

/** Prometheus metrics (§04.6 NFR-MON-1, §15.3). */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.4, 1, 2, 5],
  registers: [registry],
});

export const businessCounters = {
  notificationsSent: new Counter({
    name: "notifications_sent_total",
    help: "Notifications sent",
    registers: [registry],
  }),
};

@Public()
@Controller()
class MetricsController {
  @Get("metrics")
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  }
}

@Global()
@Module({ controllers: [MetricsController] })
export class MetricsModule {}
