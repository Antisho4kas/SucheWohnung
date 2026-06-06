import { z } from "zod";
import { loadJwtKeyConfig } from "../auth/jwt-config.js";

const booleanEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

/** Environment configuration schema (12-factor, §13.4). Validated at boot. */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().default("http://localhost:3000"),
  WEB_BASE_URL: z.string().default("http://localhost:8080"),
  JWT_PRIVATE_KEY_BASE64: z.string().default(""),
  JWT_PUBLIC_KEY_BASE64: z.string().default(""),
  JWT_DEV_SECRET: z.string().default(""),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ARGON_MEMORY_KIB: z.coerce.number().int().positive().default(19456),
  FREE_PROFILE_LIMIT: z.coerce.number().int().positive().default(3),
  PREMIUM_PROFILE_LIMIT: z.coerce.number().int().positive().default(20),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_BOT_USERNAME: z.string().default("SucheWohnungBot"),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  CREDENTIALS_ENC_KEY_BASE64: z.string().default(""),
  SMTP_URL: z.string().default(""),
  EMAIL_FROM: z.string().default("no-reply@suchewohnung.de"),
  API_SWAGGER_ENABLED: booleanEnv.optional(),
  METRICS_PUBLIC_ENABLED: booleanEnv.optional(),
  SUPER_ADMIN_MUTATIONS_ENABLED: booleanEnv.optional(),
  AUTH_REFRESH_COOKIE_SECURE: booleanEnv.optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadConfig(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  loadJwtKeyConfig(parsed.data);
  return parsed.data;
}

type SurfaceEnv = {
  NODE_ENV?: unknown;
  API_SWAGGER_ENABLED?: unknown;
  METRICS_PUBLIC_ENABLED?: unknown;
  SUPER_ADMIN_MUTATIONS_ENABLED?: unknown;
  AUTH_REFRESH_COOKIE_SECURE?: unknown;
};

function envFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function isProductionLike(nodeEnv: unknown): boolean {
  return nodeEnv === "staging" || nodeEnv === "production";
}

export function isSwaggerEnabled(env: SurfaceEnv = process.env): boolean {
  const explicit = envFlag(env.API_SWAGGER_ENABLED);
  if (explicit !== undefined) return explicit;
  return !isProductionLike(env.NODE_ENV ?? "development");
}

export function isMetricsPubliclyEnabled(
  env: SurfaceEnv = process.env,
): boolean {
  const explicit = envFlag(env.METRICS_PUBLIC_ENABLED);
  if (explicit !== undefined) return explicit;
  return !isProductionLike(env.NODE_ENV ?? "development");
}

export function isSuperAdminMutationsEnabled(
  env: SurfaceEnv = process.env,
): boolean {
  return envFlag(env.SUPER_ADMIN_MUTATIONS_ENABLED) ?? false;
}

export function isRefreshCookieSecure(env: SurfaceEnv = process.env): boolean {
  const explicit = envFlag(env.AUTH_REFRESH_COOKIE_SECURE);
  if (explicit !== undefined) return explicit;
  return isProductionLike(env.NODE_ENV ?? "development");
}
