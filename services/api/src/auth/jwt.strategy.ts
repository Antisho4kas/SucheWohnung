import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service.js";
import { loadJwtKeyConfig } from "./jwt-config.js";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  status?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const jwtConfig = loadJwtKeyConfig();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      ...(jwtConfig.algorithm === "RS256"
        ? { secretOrKey: jwtConfig.publicKey, algorithms: ["RS256"] }
        : { secretOrKey: jwtConfig.secret, algorithms: ["HS256"] }),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, deletedAt: true },
    });

    if (!user || user.deletedAt || user.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }
}
