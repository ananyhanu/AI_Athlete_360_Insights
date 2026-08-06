import { afterEach, describe, expect, it } from "vitest";
import {
  clearPrototypeSession,
  hasSessionPermission,
  parsePrototypeSession,
  startAuthenticatedSession,
} from "./prototype-session";

afterEach(() => clearPrototypeSession());

describe("prototype session", () => {
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
    expect(session.displayName).toBe("Coach Ramesh");
    expect(hasSessionPermission(session, "assessment:perform")).toBe(true);
    expect(JSON.stringify(session)).not.toContain("password");
  });
});