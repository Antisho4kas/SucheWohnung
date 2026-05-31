import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@suchewohnung/shared";

export const ROLES_KEY = "roles";
/** RBAC decorator (§13.1, FR-AUTH-7). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Role hierarchy: higher roles inherit lower privileges. */
export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  premium: 1,
  admin: 2,
  super_admin: 3,
};

export function roleSatisfies(actual: UserRole, required: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
