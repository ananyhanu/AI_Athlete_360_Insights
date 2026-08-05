import { afterEach, describe, expect, it } from "vitest";
import {
  clearPrototypeSession,
  hasSessionPermission,
  parsePrototypeSession,
  startAuthenticatedSession,
  startPrototypeCoachSession,
} from "./prototype-session";

afterEach(() => clearPrototypeSession());

describe("prototype session", () => {
  it("creates a typed local coach session without any password", () => {
    const session = startPrototypeCoachSession("coach.ramesh@example.in");

    expect(session).toEqual({
      displayName: "Coach Ramesh",
      email: "coach.ramesh@example.in",
      roles: ["coach"],
    });
    expect(hasSessionPermission(session, "assessment:perform")).toBe(true);
    expect(hasSessionPermission(session, "integration:manage")).toBe(false);
    expect(JSON.stringify(session)).not.toContain("password");
  });

  it("rejects malformed persisted session data", () => {
    expect(parsePrototypeSession("not-json")).toBeNull();
    expect(parsePrototypeSession('{"email":"not-an-email"}')).toBeNull();
    clearPrototypeSession();
  });

  it("creates a typed authenticated session without retaining a password", () => {
    const session = startAuthenticatedSession({
      accessToken: "server-issued-token",
      email: "coach.ramesh@example.in",
      roles: ["coach"],
    });

    expect(session.accessToken).toBe("server-issued-token");
    expect(JSON.stringify(session)).not.toContain("password");
  });
});