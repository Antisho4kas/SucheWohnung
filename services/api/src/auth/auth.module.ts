import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { EmailService } from "../email/email.service.js";

function decodeKey(b64: string): string {
  return b64 ? Buffer.from(b64, "base64").toString("utf8") : "";
}

const privateKey = decodeKey(process.env.JWT_PRIVATE_KEY_BASE64 ?? "");
const publicKey = decodeKey(process.env.JWT_PUBLIC_KEY_BASE64 ?? "");

const jwtModule =
  privateKey && publicKey
    ? JwtModule.register({
        privateKey,
        publicKey,
        signOptions: { algorithm: "RS256" },
        verifyOptions: { algorithms: ["RS256"] },
      })
    : JwtModule.register({
        secret: "dev-insecure-secret-change-me",
        signOptions: { algorithm: "HS256" },
      });

@Module({
  imports: [PassportModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TelegramLinkService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
