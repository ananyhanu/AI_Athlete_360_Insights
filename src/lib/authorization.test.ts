import { describe, expect, it } from "vitest";
import { hasPermission, permissionsForRoles } from "./authorization";

describe("role-based access control", () => {
  it("allows an assessor to perform an assigned assessment without export access", () => {
    expect(hasPermission(["assessor"], "assessment:perform")).toBe(true);
    expect(hasPermission(["assessor"], "data:export")).toBe(false);
  });

  it("limits an athlete to their own profile and reports", () => {
    const permissions = permissionsForRoles(["athlete"]);

    expect(permissions).toContain("athlete:read-self");
    expect(permissions).toContain("report:read-self");
    expect(permissions).not.toContain("assessment:review");
  });

  it("allows a national administrator to manage integrations", () => {
    expect(hasPermission(["national-admin"], "integration:manage")).toBe(true);
  });
});
