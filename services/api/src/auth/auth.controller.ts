import {
  Body,
  Controller,
  Post,
  HttpCode,
  Inject,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { EmailService } from "../email/email.service.js";
import { isRefreshCookieSecure } from "../config/configuration.js";
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

const REFRESH_COOKIE_NAME = "sw_refresh";

type AuthResponseBody = {
  access_token: string;
};

function readCookie(req: Request, name: string): string | undefined {
  const cookie = req.headers.cookie;
  if (!cookie) return undefined;
  const found = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  const raw = found?.slice(name.length + 1);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

function toAuthResponseBody(result: {
  access_token: string;
}): AuthResponseBody {
  return { access_token: result.access_token };
}

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(TelegramLinkService)
    private readonly tgLink: TelegramLinkService,
    @Inject(EmailService)
    private readonly email: EmailService,
  ) {}

  @Post("register")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Register with email + password (FR-AUTH-1)" })
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(
      dto.email,
      dto.password,
      dto.locale,
    );
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Login → access + refresh (FR-AUTH-3)" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password);
    this.setRefreshCookie(res, result.refresh_token);
    return toAuthResponseBody(result);
  }

  @Post("refresh")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Rotate refresh token (§08.3)" })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refresh_token ?? readCookie(req, REFRESH_COOKIE_NAME);
    if (!token) throw new UnauthorizedException("Invalid refresh token");
    const result = await this.auth.refresh(token);
    this.setRefreshCookie(res, result.refresh_token);
    return toAuthResponseBody(result);
  }

  @Post("logout")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Revoke refresh token" })
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refresh_token ?? readCookie(req, REFRESH_COOKIE_NAME);
    if (token) await this.auth.logout(token);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isRefreshCookieSecure(),
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge:
        Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: isRefreshCookieSecure(),
      sameSite: "strict",
      path: "/api/v1/auth",
    });
  }

  @Post("password/reset-request")
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
  @ApiOperation({
    summary: "Get Telegram deep-link for account binding (FR-AUTH-6)",
  })
  telegramLink(@CurrentUser() user: JwtPayload) {
    return this.tgLink.createLink(user.sub);
  }
}
