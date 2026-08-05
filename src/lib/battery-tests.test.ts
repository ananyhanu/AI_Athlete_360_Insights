import { describe, expect, it } from "vitest";
import { aiMeasurementCapabilities, batteryTests } from "./battery-tests";

describe("battery test coach metrics", () => {
  it("defines a coach-validation metric and valid range for every assessment", () => {
    expect(batteryTests).toHaveLength(10);

    for (const test of batteryTests) {
      expect(test.manualEntry).toMatchObject({
        label: expect.any(String),
        max: expect.any(Number),
        min: expect.any(Number),
        step: expect.any(Number),
      });
      expect(test.manualEntry!.max).toBeGreaterThan(test.manualEntry!.min);
      expect(test.manualEntry!.step).toBeGreaterThan(0);
    }
  });

  it("uses the correct result units for the designated test metrics", () => {
    expect(Object.fromEntries(batteryTests.map((test) => [test.id, test.unit]))).toEqual({
      "30m-sprint": "s",
      "4x10-shuttle-run": "s",
      "broad-jump": "m",
      "endurance-run": "m",
      height: "cm",
      "medicine-ball-throw": "m",
      "sit-and-reach": "cm",
      "sit-ups": "reps",
      "vertical-jump": "cm",
      weight: "kg",
    });
  });

  it("defines current and future AI measurement coverage for all ten tests", () => {
    expect(Object.keys(aiMeasurementCapabilities).sort()).toEqual(
      batteryTests.map((test) => test.id).sort(),
    );
    expect(
      batteryTests.filter((test) => aiMeasurementCapabilities[test.id]?.current === "pose-estimate"),
    ).toHaveLength(8);
    expect(aiMeasurementCapabilities["height"]).toMatchObject({ current: "manual-only" });
    expect(aiMeasurementCapabilities["weight"]).toMatchObject({ current: "manual-only" });
  });
});