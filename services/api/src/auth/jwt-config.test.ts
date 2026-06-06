import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadJwtKeyConfig } from "./jwt-config";

function rsaEnv(nodeEnv = "production") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    NODE_ENV: nodeEnv,
    JWT_PRIVATE_KEY_BASE64: Buffer.from(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    ).toString("base64"),
    JWT_PUBLIC_KEY_BASE64: Buffer.from(
      publicKey.export({ type: "spki", format: "pem" }).toString(),
    ).toString("base64"),
  };
}

describe("JWT key config", () => {
  it("requires RS256 keys in production", () => {
    expect(() => loadJwtKeyConfig({ NODE_ENV: "production" })).toThrow(/RS256|JWT_PRIVATE_KEY_BASE64/i);
  });

  it("requires RS256 keys in staging", () => {
    expect(() => loadJwtKeyConfig({ NODE_ENV: "staging" })).toThrow(/RS256|JWT_PRIVATE_KEY_BASE64/i);
  });

  it("rejects partial RS256 key configuration", () => {
    expect(() =>
      loadJwtKeyConfig({
        NODE_ENV: "production",
        JWT_PRIVATE_KEY_BASE64: Buffer.from("not a pem").toString("base64"),
      }),
    ).toThrow(/JWT_PUBLIC_KEY_BASE64|PEM|RS256/i);
  });

  it("rejects non-RSA production keys", () => {
    expect(() =>
      loadJwtKeyConfig({
        NODE_ENV: "production",
        JWT_PRIVATE_KEY_BASE64: Buffer.from("not a pem").toString("base64"),
        JWT_PUBLIC_KEY_BASE64: Buffer.from("not a pem").toString("base64"),
      }),
    ).toThrow(/PEM|RSA|RS256/i);
  });

  it("loads valid RS256 key pairs", () => {
    const config = loadJwtKeyConfig(rsaEnv());
    expect(config.algorithm).toBe("RS256");
    expect(config.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(config.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(config.secret).toBeUndefined();
  });

  it("uses a non-hardcoded generated secret outside production when RS256 keys are absent", () => {
    const first = loadJwtKeyConfig({ NODE_ENV: "development" });
    const second = loadJwtKeyConfig({ NODE_ENV: "test" });

    expect(first.algorithm).toBe("HS256");
    expect(first.secret).toEqual(expect.any(String));
    expect(first.secret).toHaveLength(64);
    expect(first.secret).not.toBe("dev-insecure-secret-change-me");
    expect(second.secret).toBe(first.secret);

    expect(
      loadJwtKeyConfig({
        NODE_ENV: "test",
        JWT_DEV_SECRET: "test-secret-with-at-least-32-chars",
      }),
    ).toEqual({ algorithm: "HS256", secret: "test-secret-with-at-least-32-chars" });
  });
});
