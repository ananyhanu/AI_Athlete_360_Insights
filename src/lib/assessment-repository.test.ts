import { describe, expect, it } from "vitest";
import { ApiClient } from "./api-client";
import { type AssessmentAttempt } from "./assessment-domain";
import { HttpAssessmentRepository } from "./assessment-repository";

const attempt = {
  athleteId: "athlete-001",
  captureId: null,
  createdAt: "2026-08-05T10:00:00.000Z",
  dataStatus: "provisional",
  evaluation: null,
  id: "b7d54083-50cc-4071-9fbd-e2530969e292",
  lastSyncError: null,
  measurement: { label: "Height", unit: "cm", value: 176 },
  reviewStatus: "awaiting-coach-review",
  source: "manual",
  status: "completed",
  syncAttempts: 0,
  syncState: "pending",
  testId: "height",
  updatedAt: "2026-08-05T10:00:00.000Z",
  version: 1,
} satisfies AssessmentAttempt;

describe("HTTP assessment repository", () => {
  it("sends authenticated, traceable, idempotent assessment upserts", async () => {
    let request: Request | undefined;
    const apiClient = new ApiClient({
      baseUrl: "https://api.example.in",
      createCorrelationId: () => "correlation-assessment-001",
      fetchFn: async (input, init) => {
        request = new Request(input, init);
        return Response.json(attempt, { status: 201 });
      },
      getAccessToken: () => "access-token",
    });
    const repository = new HttpAssessmentRepository(apiClient);

    const saved = await repository.upsert(attempt, attempt.id);

    expect(saved).toEqual(attempt);
    expect(request?.url).toBe("https://api.example.in/v1/assessment-attempts");
    expect(request?.headers.get("Authorization")).toBe("Bearer access-token");
    expect(request?.headers.get("Idempotency-Key")).toBe(attempt.id);
    expect(request?.headers.get("X-Correlation-ID")).toBe("correlation-assessment-001");
    await expect(request?.json()).resolves.toMatchObject({ id: attempt.id, testId: "height" });
  });

  it("preserves structured conflict errors for sync retry handling", async () => {
    const apiClient = new ApiClient({
      baseUrl: "https://api.example.in",
      createCorrelationId: () => "correlation-assessment-002",
      fetchFn: async () =>
        Response.json(
          {
            code: "assessment_version_conflict",
            message: "The assessment attempt has a newer server version.",
          },
          { status: 409 },
        ),
    });
    const repository = new HttpAssessmentRepository(apiClient);

    await expect(repository.upsert(attempt, attempt.id)).rejects.toEqual(
      expect.objectContaining({
        code: "assessment_version_conflict",
        correlationId: "correlation-assessment-002",
        status: 409,
      }),
    );
  });
});