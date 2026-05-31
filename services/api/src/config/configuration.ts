import { z } from "zod";

/** Environment configuration schema (12-factor, §13.4). Validated at boot. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().default("http://localhost:3000"),
  WEB_BASE_URL: z.string().default("http://localhost:8080"),
  JWT_PRIVATE_KEY_BASE64: z.string().default(""),
  JWT_PUBLIC_KEY_BASE64: z.string().default(""),
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
  return parsed.data;
}
