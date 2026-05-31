import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** Correlation ID (§04.5 NFR-LOG-2, §08.2 X-Request-Id). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
    req.headers["x-request-id"] = id;
    res.setHeader("X-Request-Id", id);
    next();
  }
}
