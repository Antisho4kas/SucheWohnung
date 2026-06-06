import { createPrivateKey, createPublicKey, randomBytes, type KeyObject } from "node:crypto";

const PRODUCTION_ENVS = new Set(["staging", "production"]);
let generatedDevelopmentSecret: string | undefined;

export interface JwtKeyConfig {
  readonly algorithm: "RS256" | "HS256";
  readonly privateKey?: string;
  readonly publicKey?: string;
  readonly secret?: string;
}

export function isProductionLikeEnv(nodeEnv = process.env.NODE_ENV ?? "development"): boolean {
  return PRODUCTION_ENVS.has(nodeEnv);
}

export function decodeBase64Pem(value: string, name: string): string {
  if (!value) throw new Error(`${name} is required for RS256 JWT signing`);
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    if (!decoded.includes("-----BEGIN") || !decoded.includes("-----END")) {
      throw new Error("decoded value is not a PEM key");
    }
    return decoded;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid base64 value";
    throw new Error(`${name} must be a base64-encoded PEM key: ${message}`);
  }
}

export function assertRsaPrivateKey(pem: string): void {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid private key";
    throw new Error(`JWT_PRIVATE_KEY_BASE64 must contain a valid RSA private key for RS256: ${message}`);
  }
  if (key.asymmetricKeyType !== "rsa" && key.asymmetricKeyType !== "rsa-pss") {
    throw new Error("JWT_PRIVATE_KEY_BASE64 must contain an RSA private key for RS256");
  }
}

export function assertRsaPublicKey(pem: string): void {
  let key: KeyObject;
  try {
    key = createPublicKey(pem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid public key";
    throw new Error(`JWT_PUBLIC_KEY_BASE64 must contain a valid RSA public key for RS256: ${message}`);
  }
  if (key.asymmetricKeyType !== "rsa" && key.asymmetricKeyType !== "rsa-pss") {
    throw new Error("JWT_PUBLIC_KEY_BASE64 must contain an RSA public key for RS256");
  }
}

export function loadJwtKeyConfig(env: Record<string, unknown> = process.env): JwtKeyConfig {
  const nodeEnv = typeof env.NODE_ENV === "string" ? env.NODE_ENV : "development";
  const privateB64 = typeof env.JWT_PRIVATE_KEY_BASE64 === "string" ? env.JWT_PRIVATE_KEY_BASE64 : "";
  const publicB64 = typeof env.JWT_PUBLIC_KEY_BASE64 === "string" ? env.JWT_PUBLIC_KEY_BASE64 : "";

  if (privateB64 || publicB64) {
    const privateKey = decodeBase64Pem(privateB64, "JWT_PRIVATE_KEY_BASE64");
    const publicKey = decodeBase64Pem(publicB64, "JWT_PUBLIC_KEY_BASE64");
    assertRsaPrivateKey(privateKey);
    assertRsaPublicKey(publicKey);
    return { algorithm: "RS256", privateKey, publicKey };
  }

  if (isProductionLikeEnv(nodeEnv)) {
    throw new Error(
      "JWT_PRIVATE_KEY_BASE64 and JWT_PUBLIC_KEY_BASE64 are required in staging/production for RS256 JWT signing",
    );
  }

  const devSecret = typeof env.JWT_DEV_SECRET === "string" ? env.JWT_DEV_SECRET : "";
  const secret = devSecret.length >= 32
    ? devSecret
    : getGeneratedDevelopmentSecret();

  return { algorithm: "HS256", secret };
}

function getGeneratedDevelopmentSecret(): string {
  generatedDevelopmentSecret ??= randomBytes(32).toString("hex");
  return generatedDevelopmentSecret;
}
