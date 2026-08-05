import { describe, expect, it } from "vitest";
import {
  coachPerformanceBand,
  coachPerformanceLevelForScore,
  coachPerformanceScoreError,
  isCoachPerformanceScoreValid,
} from "./coach-performance-scoring";

describe("coach performance scoring", () => {
  it("maps every score boundary to one transparent provisional rating band", () => {
    expect(coachPerformanceLevelForScore(0)).toBe("Needs Improvement");
    expect(coachPerformanceLevelForScore(49)).toBe("Needs Improvement");
    expect(coachPerformanceLevelForScore(50)).toBe("Average");
    expect(coachPerformanceLevelForScore(69)).toBe("Average");
    expect(coachPerformanceLevelForScore(70)).toBe("Good");
    expect(coachPerformanceLevelForScore(84)).toBe("Good");
    expect(coachPerformanceLevelForScore(85)).toBe("Excellent");
    expect(coachPerformanceLevelForScore(100)).toBe("Excellent");
    expect(coachPerformanceLevelForScore(100.5)).toBeNull();
  });

  it("rejects a score that does not match the coach-selected rating", () => {
    expect(isCoachPerformanceScoreValid(78, "Good")).toBe(true);
    expect(coachPerformanceScoreError(78, "Excellent")).toBe(
      "Excellent scores must be whole numbers from 85 to 100.",
    );
    expect(coachPerformanceBand("Average")).toMatchObject({
      maximum: 69,
      minimum: 50,
      suggestedScore: 60,
    });
  });
});