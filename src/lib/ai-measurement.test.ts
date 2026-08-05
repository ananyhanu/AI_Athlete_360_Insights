import { describe, expect, it } from "vitest";
import { getBatteryTest } from "./battery-tests";
import { estimateAiMeasurement, evaluateManualRangeMeasurement } from "./ai-measurement";

describe("AI measurement estimates", () => {
  it("returns an allowed-range validation metric for calibrated manual measurements", () => {
    for (const [id, value] of [
      ["height", 163],
      ["weight", 54],
    ] as const) {
      expect(evaluateManualRangeMeasurement(getBatteryTest(id), value)).toMatchObject({
        level: "Excellent",
        measurement: { value },
        score: 100,
        source: "coach-validated",
      });
    }
  });

  it("requires a coach-timed 30m sprint result until start and finish lines are verified", () => {
    const outcome = estimateAiMeasurement(getBatteryTest("30m-sprint"), {
      horizontalDisplacementBodyHeights: 7.8,
      horizontalTravelBodyHeights: 8.2,
      observedDurationSeconds: 7.4,
      verticalDisplacementBodyHeights: 0.2,
      verticalTravelBodyHeights: 1.1,
      wristTravelBodyHeights: 1.8,
    });

    expect(outcome).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("verified start and finish lines"),
    });
  });

  it("does not create a 30m sprint value from an arbitrary video duration", () => {
    const outcome = estimateAiMeasurement(getBatteryTest("30m-sprint"), {
      horizontalDisplacementBodyHeights: 7.8,
      horizontalTravelBodyHeights: 8.2,
      observedDurationSeconds: 21.1,
      verticalDisplacementBodyHeights: 0.2,
      verticalTravelBodyHeights: 1.1,
      wristTravelBodyHeights: 1.8,
    });

    expect(outcome).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("approved timing method"),
    });
  });

  it("reserves age- and course-dependent protocols for coach-confirmed measurements", () => {
    const motion = {
      horizontalDisplacementBodyHeights: 0.1,
      horizontalTravelBodyHeights: 8.2,
      observedDurationSeconds: 12,
      verticalDisplacementBodyHeights: 0.9,
      verticalRangeBodyHeights: 0.9,
      verticalTravelBodyHeights: 1.2,
      wristTravelBodyHeights: 1.8,
      torsoMovementCycles: 6,
    };

    const outcomes = [
      "sit-and-reach",
      "vertical-jump",
      "broad-jump",
      "medicine-ball-throw",
      "30m-sprint",
      "4x10-shuttle-run",
      "sit-ups",
      "endurance-run",
    ].map((id) => estimateAiMeasurement(getBatteryTest(id), motion, 170));

    expect(outcomes).toHaveLength(8);
    const estimates = outcomes.filter((outcome) => outcome.status === "estimated");
    expect(estimates).toHaveLength(4);
    for (const outcome of estimates) {
      if (outcome.status !== "estimated") throw new Error("Expected an AI estimate.");
      expect(outcome.estimate.measurement.value).toBeGreaterThanOrEqual(0);
      expect(outcome.estimate.score).toBeTypeOf("number");
      expect(outcome.estimate.level).not.toBe("Not scored");
      expect(outcome.estimate.validationReason).toContain("AI estimated");
    }
    for (const outcome of outcomes.slice(4)) {
      expect(outcome).toMatchObject({ status: "unavailable" });
    }
  });
});