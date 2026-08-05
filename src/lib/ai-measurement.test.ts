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

  it("turns a tracked 30m sprint movement duration into an in-range provisional result", () => {
    const outcome = estimateAiMeasurement(getBatteryTest("30m-sprint"), {
      horizontalDisplacementBodyHeights: 7.8,
      horizontalTravelBodyHeights: 8.2,
      observedDurationSeconds: 7.4,
      verticalDisplacementBodyHeights: 0.2,
      verticalTravelBodyHeights: 1.1,
      wristTravelBodyHeights: 1.8,
    });

    expect(outcome).toMatchObject({
      estimate: {
        level: "Good",
        measurement: { label: "30m Sprint", unit: "s", value: 7.4 },
        requiresCoachIntervention: false,
        score: 78,
      },
      status: "estimated",
    });
  });

  it("keeps an out-of-range AI timing visible and routes it to coach intervention", () => {
    const outcome = estimateAiMeasurement(getBatteryTest("30m-sprint"), {
      horizontalDisplacementBodyHeights: 7.8,
      horizontalTravelBodyHeights: 8.2,
      observedDurationSeconds: 21.1,
      verticalDisplacementBodyHeights: 0.2,
      verticalTravelBodyHeights: 1.1,
      wristTravelBodyHeights: 1.8,
    });

    expect(outcome).toMatchObject({
      estimate: {
        level: "Needs Improvement",
        measurement: { value: 21.1 },
        requiresCoachIntervention: true,
        score: 0,
      },
      status: "estimated",
    });
  });

  it("creates range-validated provisional estimates for every video test", () => {
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
    expect(outcomes.every((outcome) => outcome.status === "estimated")).toBe(true);
    for (const outcome of outcomes) {
      if (outcome.status !== "estimated") throw new Error("Expected an AI estimate.");
      expect(outcome.estimate.measurement.value).toBeGreaterThanOrEqual(0);
      expect(outcome.estimate.score).toBeTypeOf("number");
      expect(outcome.estimate.level).not.toBe("Not scored");
      expect(outcome.estimate.validationReason).toContain("AI estimated");
    }
  });
});