import { z } from "zod";

export const appRoleSchema = z.enum([
  "athlete",
  "guardian",
  "coach",
  "assessor",
  "institution-admin",
  "district-authority",
  "state-authority",
  "national-admin",
]);

export const permissionSchema = z.enum([
  "athlete:read-linked",
  "athlete:read-self",
  "athlete:read-assigned",
  "athlete:register",
  "athlete:update-self",
  "assessment:perform",
  "assessment:review",
  "assessment:schedule",
  "report:generate",
  "report:read-linked",
  "report:read-self",
  "report:read-assigned",
  "analytics:read-institution",
  "analytics:read-district",
  "analytics:read-state",
  "analytics:read-national",
  "data:export",
  "integration:manage",
  "users:manage",
]);

export type AppRole = z.infer<typeof appRoleSchema>;
export type Permission = z.infer<typeof permissionSchema>;

const permissionsByRole: Record<AppRole, readonly Permission[]> = {
  athlete: ["athlete:read-self", "athlete:update-self", "report:read-self"],
  guardian: ["athlete:read-linked", "report:read-linked"],
  coach: [
    "athlete:read-assigned",
    "athlete:register",
    "assessment:perform",
    "assessment:review",
    "assessment:schedule",
    "report:generate",
    "report:read-assigned",
  ],
  assessor: ["athlete:read-assigned", "athlete:register", "assessment:perform", "report:generate"],
  "institution-admin": [
    "athlete:read-assigned",
    "athlete:register",
    "assessment:review",
    "assessment:schedule",
    "report:generate",
    "report:read-assigned",
    "analytics:read-institution",
    "data:export",
    "users:manage",
  ],
  "district-authority": ["analytics:read-district"],
  "state-authority": ["analytics:read-state"],
  "national-admin": [
    "analytics:read-national",
    "data:export",
    "integration:manage",
    "users:manage",
  ],
};

export function hasPermission(roles: readonly AppRole[], permission: Permission) {
  return roles.some((role) => permissionsByRole[role].includes(permission));
}

export function permissionsForRoles(roles: readonly AppRole[]) {
  return new Set(roles.flatMap((role) => permissionsByRole[role]));
}
