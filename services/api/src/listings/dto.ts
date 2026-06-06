import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const optionalNumberQuery = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? undefined : Number(value)))
  .pipe(z.number().nonnegative().finite().optional());

export const ListingSearchQuerySchema = z
  .object({
    city: z.string().trim().min(1).max(200).optional(),
    price_max: optionalNumberQuery,
    price_min: optionalNumberQuery,
    rooms_min: optionalNumberQuery,
    area_min: optionalNumberQuery,
    limit: z
      .string()
      .optional()
      .transform((value) => (value === undefined ? 20 : Number(value)))
      .pipe(z.number().int().positive().max(100)),
    cursor: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.price_min === undefined || value.price_max === undefined || value.price_min <= value.price_max,
    { message: "price_min must be less than or equal to price_max", path: ["price_min"] },
  );
export class ListingSearchQueryDto extends createZodDto(ListingSearchQuerySchema) {}

export const ListingIdParamSchema = z.object({ id: z.string().uuid() }).strict();
export class ListingIdParamDto extends createZodDto(ListingIdParamSchema) {}
