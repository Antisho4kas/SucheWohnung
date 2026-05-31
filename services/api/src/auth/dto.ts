import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  locale: z.enum(["de", "en", "ru"]).optional(),
});
export class RegisterDto extends createZodDto(RegisterSchema) {}

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export class LoginDto extends createZodDto(LoginSchema) {}

export const RefreshSchema = z.object({ refresh_token: z.string().min(1) });
export class RefreshDto extends createZodDto(RefreshSchema) {}

export const VerifyEmailSchema = z.object({ token: z.string().min(1) });
export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}

export const ResetRequestSchema = z.object({ email: z.string().email() });
export class ResetRequestDto extends createZodDto(ResetRequestSchema) {}

export const ResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});
export class ResetDto extends createZodDto(ResetSchema) {}
