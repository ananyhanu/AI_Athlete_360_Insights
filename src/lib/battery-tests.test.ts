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
      "endurance-run": "min",
      height: "cm",
      "medicine-ball-throw": "m",
      "sit-and-reach": "cm",
      "sit-ups": "reps",
      "vertical-jump": "cm",
      weight: "kg",
    });
  });

  it("uses SAI-aligned allowed entry ranges for all ten measurements", () => {
    expect(
      Object.fromEntries(
        batteryTests.map((test) => [test.id, [test.manualEntry!.min, test.manualEntry!.max]]),
      ),
    ).toEqual({
      "30m-sprint": [3.5, 15],
      "4x10-shuttle-run": [7.5, 35],
      "broad-jump": [0.5, 4],
      "endurance-run": [1.5, 15],
      height: [80, 230],
      "medicine-ball-throw": [1, 25],
      "sit-and-reach": [0, 50],
      "sit-ups": [0, 60],
      "vertical-jump": [5, 120],
      weight: [15, 200],
    });
  });

  it("defines current and future AI measurement coverage for all ten tests", () => {
    expect(Object.keys(aiMeasurementCapabilities).sort()).toEqual(
      batteryTests.map((test) => test.id).sort(),
    );
    expect(
      batteryTests.filter((test) => aiMeasurementCapabilities[test.id]?.current === "pose-estimate"),
    ).toHaveLength(4);
    expect(aiMeasurementCapabilities["height"]).toMatchObject({ current: "manual-only" });
    expect(aiMeasurementCapabilities["weight"]).toMatchObject({ current: "manual-only" });
    expect(aiMeasurementCapabilities["30m-sprint"]).toMatchObject({ current: "manual-only" });
    expect(aiMeasurementCapabilities["4x10-shuttle-run"]).toMatchObject({ current: "manual-only" });
    expect(aiMeasurementCapabilities["sit-ups"]).toMatchObject({ current: "manual-only" });
    expect(aiMeasurementCapabilities["endurance-run"]).toMatchObject({ current: "manual-only" });
  });
});