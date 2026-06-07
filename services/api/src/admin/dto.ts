import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const JsonObjectSchema = z.record(z.unknown());
const SourceConfigSchema = JsonObjectSchema.refine(
  (value) => !containsRawSecretKey(value),
  "Source config must reference secrets, not include raw secret values",
);
const UserRoleSchema = z.enum(["user", "premium", "admin", "super_admin"]);
const UserStatusSchema = z.enum(["pending", "active", "suspended", "deleted"]);
const IntegrationTypeSchema = z.enum(["api", "scrape"]);
const FilterDataTypeSchema = z.enum(["number", "bool", "enum", "text", "range", "geo"]);
const FilterOperatorSchema = z.enum(["gte", "lte", "eq", "in", "within"]);

const stringLimit = (fallback: number, max: number) =>
  z
    // Accept string (raw query value) OR number. A global ZodValidationPipe plus a
    // per-route ZodValidationPipe can run this schema twice; after the first pass
    // the value is already a number, so the input type must tolerate both to avoid
    // a spurious "expected string, received number" on the second pass.
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined ? fallback : Number(value)))
    .pipe(z.number().int().positive().max(max));

export const AdminUsersQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    limit: stringLimit(50, 200),
  })
  .strict();
export class AdminUsersQueryDto extends createZodDto(AdminUsersQuerySchema) {}

export const AdminLogsQuerySchema = z
  .object({
    limit: stringLimit(100, 500),
  })
  .strict();
export class AdminLogsQueryDto extends createZodDto(AdminLogsQuerySchema) {}

export const AdminUpdateUserSchema = z
  .object({
    role: UserRoleSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: "At least one field is required",
  });
export class AdminUpdateUserDto extends createZodDto(AdminUpdateUserSchema) {}

export const AdminCreateSourceSchema = z
  .object({
    slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(200),
    integration_type: IntegrationTypeSchema.default("scrape"),
    schedule_cron: z.string().trim().min(1).max(100).default("*/15 * * * *"),
    rate_limit_rpm: z.coerce.number().int().positive().max(600).default(30),
    config: SourceConfigSchema.default({}),
  })
  .strict();
export class AdminCreateSourceDto extends createZodDto(AdminCreateSourceSchema) {}

export const AdminUpdateSourceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    is_active: z.boolean().optional(),
    enabled: z.boolean().optional(),
    schedule_cron: z.string().trim().min(1).max(100).optional(),
    rate_limit_rpm: z.coerce.number().int().positive().max(600).optional(),
    config: SourceConfigSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });
export class AdminUpdateSourceDto extends createZodDto(AdminUpdateSourceSchema) {}

export const AdminCreateFilterSchema = z
  .object({
    key: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/),
    label: z.record(z.string().min(1)).default({}),
    data_type: FilterDataTypeSchema,
    operator_set: z.array(FilterOperatorSchema).min(1),
    config: JsonObjectSchema.default({}),
    is_active: z.boolean().default(true),
  })
  .strict();
export class AdminCreateFilterDto extends createZodDto(AdminCreateFilterSchema) {}

export const AdminUpdateFilterSchema = z
  .object({
    label: z.record(z.string().min(1)).optional(),
    data_type: FilterDataTypeSchema.optional(),
    operator_set: z.array(FilterOperatorSchema).min(1).optional(),
    config: JsonObjectSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });
export class AdminUpdateFilterDto extends createZodDto(AdminUpdateFilterSchema) {}

function containsRawSecretKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsRawSecretKey(item));

  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    const isReference =
      normalized.endsWith("ref") ||
      normalized.endsWith("reference") ||
      normalized.endsWith("id");
    const looksSecret = [
      "password",
      "passwd",
      "pwd",
      "token",
      "secret",
      "apikey",
      "authorization",
      "cookie",
      "dsn",
      "databaseurl",
    ].some((term) => normalized.includes(term));

    return (looksSecret && !isReference) || containsRawSecretKey(nested);
  });
}
