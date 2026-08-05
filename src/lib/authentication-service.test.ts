import { describe, expect, it } from "vitest";
import { authenticateWithPassword } from "./authentication-service";

describe("password authentication service", () => {
  it("posts credentials to the token endpoint and validates the authenticated profile", async () => {
    let request: Request | undefined;

    const authenticated = await authenticateWithPassword({
      baseUrl: "https://api.example.in",
      email: "coach@example.in",
      fetchFn: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          accessToken: "server-issued-token",
          tokenType: "bearer",
          user: { email: "coach@example.in", id: "coach-001", roles: ["coach"] },
        });
      },
      password: "correct-horse-battery-staple",
    });

    expect(request?.url).toBe("https://api.example.in/v1/auth/token");
    expect(request?.method).toBe("POST");
    await expect(request?.json()).resolves.toEqual({
      email: "coach@example.in",
      password: "correct-horse-battery-staple",
    });
    expect(authenticated.user.roles).toEqual(["coach"]);
  });
});