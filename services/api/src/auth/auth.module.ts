import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { TelegramLinkService } from "./telegram-link.service.js";
import { EmailService } from "../email/email.service.js";
import { loadJwtKeyConfig } from "./jwt-config.js";

const jwtConfig = loadJwtKeyConfig();

const jwtModule =
  jwtConfig.algorithm === "RS256"
    ? JwtModule.register({
        privateKey: jwtConfig.privateKey,
        publicKey: jwtConfig.publicKey,
        signOptions: { algorithm: "RS256" },
        verifyOptions: { algorithms: ["RS256"] },
      })
    : JwtModule.register({
        secret: jwtConfig.secret,
        signOptions: { algorithm: "HS256" },
        verifyOptions: { algorithms: ["HS256"] },
      });

@Module({
  imports: [PassportModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TelegramLinkService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
