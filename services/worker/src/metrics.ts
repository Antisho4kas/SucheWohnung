import { createServer, type Server } from "node:http";
import {
  Counter,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

/**
 * Prometheus metrics for the worker processes (§04.6 NFR-MON-1, §15.3).
 *
 * Source-collect runs are recorded by `collect.ts` and surfaced here so a
 * broken/blocked scraping source raises an alert instead of failing silently.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

/** Terminal collect-run outcomes we accept from callers. */
export type SourceRunStatus = "success" | "partial" | "failed";

export const sourceRunTotal = new Counter({
  name: "suchewohnung_source_run_total",
  help: "Total collect runs by source and terminal status",
  labelNames: ["source", "status"],
  registers: [registry],
});

export const sourceRunErrorsTotal = new Counter({
  name: "suchewohnung_source_run_errors_total",
  help: "Accumulated collect run errors by source",
  labelNames: ["source"],
  registers: [registry],
});

export const sourceItemsNewTotal = new Counter({
  name: "suchewohnung_source_items_new_total",
  help: "Accumulated new items by source",
  labelNames: ["source"],
  registers: [registry],
});

export const sourceLastSuccessTimestamp = new Gauge({
  name: "suchewohnung_source_last_success_timestamp_seconds",
  help: "Unix timestamp (seconds) of the last successful collect run by source",
  labelNames: ["source"],
  registers: [registry],
});

export const sourceLastRunNewItems = new Gauge({
  name: "suchewohnung_source_last_run_new_items",
  help: "New items produced by the most recent collect run by source",
  labelNames: ["source"],
  registers: [registry],
});

export type SourceRunOutcome = {
  source: string;
  status: SourceRunStatus;
  errors: number;
  itemsNew: number;
};

/**
 * Records the outcome of a single collect run across all source-health
 * metrics. `last_success_timestamp` is only advanced on a fully successful run.
 */
export function recordSourceRunOutcome({
  source,
  status,
  errors,
  itemsNew,
}: SourceRunOutcome): void {
  sourceRunTotal.inc({ source, status });
  if (errors > 0) {
    sourceRunErrorsTotal.inc({ source }, errors);
  }
  if (itemsNew > 0) {
    sourceItemsNewTotal.inc({ source }, itemsNew);
  }
  sourceLastRunNewItems.set({ source }, itemsNew);
  if (status === "success") {
    sourceLastSuccessTimestamp.set({ source }, Date.now() / 1000);
  }
}

/**
 * Starts a minimal HTTP server exposing `GET /metrics`. Resilient by design:
 * a listen failure is logged and swallowed so metrics never take the worker
 * process down.
 */
export function startMetricsServer(port?: number): Server {
  const listenPort =
    port ?? Number(process.env.WORKER_METRICS_PORT ?? "9101");

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "Content-Type": registry.contentType });
          res.end(body);
        })
        .catch((err: unknown) => {
          res.writeHead(500);
          res.end(
            `# metrics collection failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      return;
    }
    res.writeHead(404);
    res.end("Not Found");
  });

  server.on("error", (err) => {
    console.error(
      `[metrics] server error: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  try {
    server.listen(listenPort, () => {
      console.log(`[metrics] listening on :${listenPort}/metrics`);
    });
  } catch (err) {
    console.error(
      `[metrics] failed to start on :${listenPort}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return server;
}
