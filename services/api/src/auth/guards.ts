import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
  Optional,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";
import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@suchewohnung/shared";
import { ROLES_KEY, roleSatisfies } from "./roles.js";
import type { JwtPayload } from "./jwt.strategy.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { isSuperAdminMutationsEnabled } from "../config/configuration.js";

export const IS_PUBLIC_KEY = "isPublic";
/** Marks a route as public (skips global JWT guard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SUPER_ADMIN_MUTATION_KEY = "superAdminMutation";
/** Marks a route whose payload or target can mutate super_admin state. */
export const SuperAdminMutation = () => SetMetadata(SUPER_ADMIN_MUTATION_KEY, true);

/** JWT auth guard (Bearer access token, §08.3). */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(
    @Optional() @Inject(Reflector) private readonly reflector?: Reflector,
  ) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

/** RBAC guard — checks the required role(s) from @Roles() (§13.1). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Optional() @Inject(Reflector) private readonly reflector?: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector?.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("No authenticated user");
    const ok = required.some((r) => roleSatisfies(user.role as UserRole, r));
    if (!ok) throw new ForbiddenException("Insufficient role");
    return true;
  }
}

/** Explicit step-up gate for dangerous super_admin mutations. */
@Injectable()
export class SuperAdminMutationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enabled = this.reflector?.getAllAndOverride<boolean>(SUPER_ADMIN_MUTATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return true;

    const req = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      body?: { role?: string };
      params?: { id?: string };
    }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("No authenticated user");

    const requestedSuperAdmin = req.body?.role === "super_admin";
    if (requestedSuperAdmin) {
      this.assertSuperAdminStepUp(user);
      return true;
    }

    const targetId = req.params?.id;
    if (!targetId) {
      this.assertSuperAdminStepUp(user);
      return true;
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (target?.role !== "super_admin") return true;

    this.assertSuperAdminStepUp(user);
    return true;
  }

  private assertSuperAdminStepUp(user: JwtPayload): void {
    if (user.role !== "super_admin") {
      throw new ForbiddenException("super_admin role is required");
    }
    if (!isSuperAdminMutationsEnabled()) {
      throw new ForbiddenException("Super-admin mutations are disabled for beta");
    }
  }
}
