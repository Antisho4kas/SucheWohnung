import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const pubB64 = process.env.JWT_PUBLIC_KEY_BASE64 ?? "";
    const publicKey = pubB64 ? Buffer.from(pubB64, "base64").toString("utf8") : "";
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      ...(publicKey
        ? { secretOrKey: publicKey, algorithms: ["RS256"] }
        : { secretOrKey: "dev-insecure-secret-change-me", algorithms: ["HS256"] }),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
