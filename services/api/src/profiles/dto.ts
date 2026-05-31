import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { FILTER_OPERATORS } from "@suchewohnung/shared";

const FilterInput = z.object({
  key: z.string().min(1),
  operator: z.enum(FILTER_OPERATORS),
  value: z.unknown().optional(),
});

export const CreateProfileSchema = z.object({
  name: z.string().min(1).max(120),
  notify: z.boolean().optional(),
  filters: z.array(FilterInput).min(1),
});
export class CreateProfileDto extends createZodDto(CreateProfileSchema) {}

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  notify: z.boolean().optional(),
  is_active: z.boolean().optional(),
  filters: z.array(FilterInput).min(1).optional(),
});
export class UpdateProfileDto extends createZodDto(UpdateProfileSchema) {}
