import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("API Dockerfile", () => {
  it("copies service-level runtime dependencies into the production image", () => {
    const dockerfile = readFileSync(
      join(process.cwd(), "services/api/Dockerfile"),
      "utf8",
    );

    expect(dockerfile).toContain(
      "COPY --from=build /app/services/api/node_modules ./node_modules",
    );
  });
});
