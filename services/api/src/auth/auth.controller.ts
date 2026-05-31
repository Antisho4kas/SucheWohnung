import { Body, Controller, Post, HttpCode, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { EmailService } from "../email/email.service.js";
import { JwtAuthGuard } from "./guards.js";
import { Public } from "./guards.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { JwtPayload } from "./jwt.strategy.js";
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  VerifyEmailDto,
  ResetRequestDto,
  ResetDto,
} from "./dto.js";

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tgLink: TelegramLinkService,
    private readonly email: EmailService,
  ) {}

  @Post("register")
  @Public()
  @ApiOperation({ summary: "Register with email + password (FR-AUTH-1)" })
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(dto.email, dto.password, dto.locale);
    // Send verification email (FR-AUTH-2)
    const token = await this.auth.generateVerificationToken(result.id);
    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    await this.email.sendVerification(dto.email, token, baseUrl);
    return result;
  }

  @Post("verify-email")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Confirm email via token (FR-AUTH-2)" })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @Post("login")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Login → access + refresh (FR-AUTH-3)" })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Rotate refresh token (§08.3)" })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post("logout")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Revoke refresh token" })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refresh_token);
    return { ok: true };
  }

  @Post("password/reset-request")
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: "Request password reset email (FR-AUTH-4)" })
  async resetRequest(@Body() dto: ResetRequestDto) {
    const token = await this.auth.generatePasswordResetToken(dto.email);
    if (token) {
      const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
      await this.email.sendPasswordReset(dto.email, token, baseUrl);
    }
    // Always 202 to avoid user enumeration.
    return { ok: true };
  }

  @Post("password/reset")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Reset password via token (FR-AUTH-4)" })
  async reset(@Body() dto: ResetDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @Post("telegram/link")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get Telegram deep-link for account binding (FR-AUTH-6)" })
  telegramLink(@CurrentUser() user: JwtPayload) {
    return this.tgLink.createLink(user.sub);
  }
}
