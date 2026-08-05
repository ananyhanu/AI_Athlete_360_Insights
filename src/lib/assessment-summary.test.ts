import { describe, expect, it } from "vitest";
import { assessmentAttemptSchema, type AssessmentAttempt } from "./assessment-domain";
import { buildPerformanceTrend, summarizeAssessment } from "./assessment-summary";
import { reportRows } from "./report-pdf";

describe("assessment summary", () => {
  it("uses only the latest attempt for each test and unlocks reports after coach acceptance", () => {
    const attempts = [
      attempt({ id: "00000000-0000-4000-8000-000000000001", testId: "height" }),
      attempt({
        id: "00000000-0000-4000-8000-000000000002",
        reviewStatus: "accepted",
        testId: "height",
        updatedAt: "2026-08-05T11:00:00.000Z",
      }),
      attempt({
        evaluation: {
          level: "Good",
          measurement: { label: "Standing Vertical Jump", unit: "cm", value: 48.5 },
          poseEvidence: null,
          score: 76,
          source: "coach-validated",
          state: "requires-coach-review",
          validationReasons: ["Coach review is required."],
        },
        id: "00000000-0000-4000-8000-000000000003",
        testId: "vertical-jump",
      }),
    ];

    const summary = summarizeAssessment(attempts);

    expect(summary.accepted).toBe(1);
    expect(summary.awaitingCoachReview).toBe(1);
    expect(summary.completed).toBe(2);
    expect(summary.averageScore).toBe(76);
    expect(summary.reportReady).toBe(false);
    expect(summary.tests.find((test) => test.test.id === "height")?.attempt?.id).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("classifies invalid and rejected attempts as requiring a retest", () => {
    const summary = summarizeAssessment([
      attempt({
        id: "00000000-0000-4000-8000-000000000004",
        status: "invalid",
        testId: "sit-ups",
      }),
      attempt({
        id: "00000000-0000-4000-8000-000000000005",
        reviewStatus: "rejected",
        testId: "weight",
      }),
    ]);

    expect(summary.needsRetest).toBe(2);
    expect(summary.reportReady).toBe(false);
  });

  it("includes only valid captured tests in provisional report data", () => {
    const summary = summarizeAssessment([
      attempt({
        evaluation: evaluatedScore(78),
        id: "00000000-0000-4000-8000-000000000009",
        measurement: { label: "Standing Vertical Jump", unit: "cm", value: 52.5 },
        reviewStatus: "accepted",
        testId: "vertical-jump",
      }),
      attempt({
        id: "00000000-0000-4000-8000-000000000010",
        status: "invalid",
        testId: "sit-ups",
      }),
    ]);

    expect(reportRows(summary)).toEqual([
      {
        measurement: "52.5 cm",
        name: "Standing Vertical Jump",
        rating: "Accepted",
        score: "78",
      },
    ]);
  });

  it("groups persisted evaluated scores into a chronological performance trend", () => {
    const trend = buildPerformanceTrend([
      attempt({
        evaluation: evaluatedScore(72),
        id: "00000000-0000-4000-8000-000000000006",
        testId: "sit-ups",
        updatedAt: "2026-08-03T10:00:00.000Z",
      }),
      attempt({
        evaluation: evaluatedScore(80),
        id: "00000000-0000-4000-8000-000000000007",
        testId: "vertical-jump",
        updatedAt: "2026-08-03T11:00:00.000Z",
      }),
      attempt({
        evaluation: evaluatedScore(76),
        id: "00000000-0000-4000-8000-000000000008",
        testId: "broad-jump",
        updatedAt: "2026-08-04T10:00:00.000Z",
      }),
    ]);

    expect(trend).toEqual([
      { date: "2026-08-03", label: "08-03", score: 76 },
      { date: "2026-08-04", label: "08-04", score: 76 },
    ]);
  });
});

function attempt({
  id,
  testId,
  ...overrides
}: Partial<AssessmentAttempt> & Pick<AssessmentAttempt, "id" | "testId">) {
  return assessmentAttemptSchema.parse({
    athleteId: "athlete-001",
    captureId: null,
    createdAt: "2026-08-05T10:00:00.000Z",
    dataStatus: "provisional",
    evaluation: null,
    measurement: { label: "Manual measurement", unit: "cm", value: 170 },
    reviewStatus: "awaiting-coach-review",
    source: "manual",
    status: "completed",
    syncAttempts: 0,
    syncState: "pending",
    updatedAt: "2026-08-05T10:00:00.000Z",
    version: 1,
    ...overrides,
    id,
    testId,
  });
}

function evaluatedScore(score: number) {
  return {
    level: "Good" as const,
    measurement: { label: "Test", unit: "cm", value: 40 },
    poseEvidence: null,
    score,
    source: "coach-validated" as const,
    state: "requires-coach-review" as const,
    validationReasons: ["Coach review is required."],
  };
}