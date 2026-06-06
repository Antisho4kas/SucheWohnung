import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const UpdateMeSchema = z
  .object({
    locale: z.enum(["de", "en", "ru"]).optional(),
  })
  .strict()
  .refine((value) => value.locale !== undefined, { message: "At least one field is required" });
export class UpdateMeDto extends createZodDto(UpdateMeSchema) {}

export const SetConsentSchema = z
  .object({
    consent_type: z.string().trim().min(1).max(100),
    granted: z.boolean(),
  })
  .strict();
export class SetConsentDto extends createZodDto(SetConsentSchema) {}
