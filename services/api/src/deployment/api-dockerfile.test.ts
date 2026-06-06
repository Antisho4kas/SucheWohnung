import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readDockerfile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function expectOpenSslInstall(dockerfile: string): void {
  expect(dockerfile).toContain("apt-get install -y openssl");
}

describe("API Dockerfile", () => {
  it("copies service-level runtime dependencies into the production image", () => {
    const dockerfile = readDockerfile("services/api/Dockerfile");

    expect(dockerfile).toContain(
      "COPY --from=build /app/services/api/node_modules ./node_modules",
    );
  });

  it("installs OpenSSL before Prisma Client generation and in Prisma runtimes", () => {
    for (const path of [
      "services/api/Dockerfile",
      "services/worker/Dockerfile",
      "services/bot/Dockerfile",
    ]) {
      const dockerfile = readDockerfile(path);

      expectOpenSslInstall(dockerfile);
      expect(dockerfile.indexOf("apt-get install -y openssl")).toBeLessThan(
        dockerfile.indexOf("prisma generate"),
      );
      expect(dockerfile.split("apt-get install -y openssl")).toHaveLength(3);
    }
  });

  it("installs OpenSSL before Prisma Client generation in the web build image", () => {
    const dockerfile = readDockerfile("services/web/Dockerfile");

    expectOpenSslInstall(dockerfile);
    expect(dockerfile.indexOf("apt-get install -y openssl")).toBeLessThan(
      dockerfile.indexOf("prisma generate"),
    );
  });
});
