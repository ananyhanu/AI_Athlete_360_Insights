import { describe, expect, it } from "vitest";
import { assessmentApiBaseUrl, shouldAttemptAutomaticSync } from "./assessment-sync-runtime";

describe("assessment sync runtime configuration", () => {
  it("requires HTTPS for non-local assessment APIs", () => {
    expect(assessmentApiBaseUrl()).toBe("http://127.0.0.1:8000");
    expect(assessmentApiBaseUrl("https://assessments.example.in/v1")).toBe(
      "https://assessments.example.in",
    );
    expect(assessmentApiBaseUrl("http://assessments.example.in")).toBeNull();
  });

  it("allows loopback HTTP endpoints for local development", () => {
    expect(assessmentApiBaseUrl("http://localhost:8080")).toBe("http://localhost:8080");
    expect(assessmentApiBaseUrl("http://127.0.0.1:8080/api")).toBe("http://127.0.0.1:8080");
    expect(assessmentApiBaseUrl("not a URL")).toBeNull();
  });

  it("only attempts automatic synchronization with connectivity, an authenticated session, and a valid API origin", () => {
    expect(shouldAttemptAutomaticSync(false, "https://assessments.example.in")).toBe(false);
    expect(shouldAttemptAutomaticSync(true, "http://assessments.example.in", "token")).toBe(false);
    expect(shouldAttemptAutomaticSync(true, "https://assessments.example.in")).toBe(false);
    expect(shouldAttemptAutomaticSync(true, "https://assessments.example.in", "token")).toBe(true);
  });
});