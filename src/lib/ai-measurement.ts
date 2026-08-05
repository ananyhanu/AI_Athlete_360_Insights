import type { BatteryTest } from "./battery-tests";
import type { AssessmentEvaluation } from "./assessment-domain";
import {
  coachPerformanceLevelForScore,
  type CoachPerformanceLevel,
} from "./coach-performance-scoring";
import type { PoseMotionEvidence } from "./mediapipe-pose-analysis";

type Measurement = { label: string; unit: string; value: number };

export type AiMeasurementEstimate = {
  level: CoachPerformanceLevel;
  measurement: Measurement;
  requiresCoachIntervention: boolean;
  score: number;
  validationReason: string;
};

export type AiMeasurementOutcome =
  | { estimate: AiMeasurementEstimate; status: "estimated" }
  | { reason: string; status: "unavailable" };

const lowerIsBetterTests = new Set(["30m-sprint", "4x10-shuttle-run"]);

export function evaluateManualRangeMeasurement(
  test: BatteryTest,
  value: number,
): AssessmentEvaluation {
  const range = test.manualEntry;
  if (!range || value < range.min || value > range.max) {
    throw new Error(`The measurement must be from ${range?.min ?? 0} to ${range?.max ?? 0} ${test.unit}.`);
  }

  return {
    level: "Excellent",
    measurement: { label: test.name, unit: test.unit, value },
    poseEvidence: null,
    score: 100,
    source: "coach-validated",
    state: "requires-coach-review",
    validationReasons: [
      `Coach-recorded ${test.name}: ${value} ${test.unit} is within the configured ${range.min}-${range.max} ${test.unit} range.`,
      "This is an allowed-range validation score, not a sport-performance benchmark.",
    ],
  };
}

/**
 * Produces provisional estimates from observed pose movement. Estimates that rely on body-height
 * normalization are explicitly uncalibrated and must be checked against the test protocol.
 */
export function estimateAiMeasurement(
  test: BatteryTest,
  motion: PoseMotionEvidence | undefined,
  referenceHeightCm = 170,
): AiMeasurementOutcome {
  const range = test.manualEntry;
  if (!range) {
    return { reason: "This test has no configured measurement range.", status: "unavailable" };
  }
  if (!motion || motion.observedDurationSeconds <= 0) {
    return {
      reason: "The AI could not derive a complete movement timeline from the detected pose frames.",
      status: "unavailable",
    };
  }

  const derived = deriveMeasurementValue(test.id, motion, referenceHeightCm);
  if (!derived) {
    return {
      reason: "The AI could not derive the movement feature required for this test.",
      status: "unavailable",
    };
  }

  const value = roundToStep(derived.value, range.step);
  const inRange = value >= range.min && value <= range.max;
  const score = inRange
    ? rangeNormalizedScore(value, range.min, range.max, lowerIsBetterTests.has(test.id))
    : 0;
  const level = coachPerformanceLevelForScore(score) ?? "Needs Improvement";
  const measurement = { label: test.name, unit: test.unit, value };

  return {
    estimate: {
      level,
      measurement,
      requiresCoachIntervention: !inRange,
      score,
      validationReason: inRange
        ? `AI estimated ${test.name}: ${value} ${test.unit} from ${derived.description}; the estimate is within the configured ${range.min}-${range.max} ${test.unit} range and requires coach review.`
        : `AI estimated ${test.name}: ${value} ${test.unit} from ${derived.description}, which is outside the configured ${range.min}-${range.max} ${test.unit} range. Coach intervention is required before this result can be used.`,
    },
    status: "estimated",
  };
}

function deriveMeasurementValue(
  testId: string,
  motion: PoseMotionEvidence,
  referenceHeightCm: number,
) {
  const heightCm = Number.isFinite(referenceHeightCm) && referenceHeightCm > 0 ? referenceHeightCm : 170;
  const heightMetres = heightCm / 100;

  switch (testId) {
    case "30m-sprint":
    case "4x10-shuttle-run":
      return { description: "the tracked movement timeline", value: motion.observedDurationSeconds };
    case "sit-and-reach":
      return {
        description: "wrist travel normalized to the athlete height (uncalibrated)",
        value: motion.wristTravelBodyHeights * heightCm * 0.16,
      };
    case "vertical-jump":
      return {
        description: "vertical pose displacement normalized to the athlete height (uncalibrated)",
        value: (motion.verticalRangeBodyHeights ?? 0) * heightCm * 0.35,
      };
    case "broad-jump":
      return {
        description: "horizontal pose displacement normalized to the athlete height (uncalibrated)",
        value: motion.horizontalDisplacementBodyHeights * heightMetres * 1.15,
      };
    case "medicine-ball-throw":
      return {
        description: "wrist trajectory normalized to the athlete height (uncalibrated)",
        value: motion.wristTravelBodyHeights * heightMetres * 1.2,
      };
    case "sit-ups":
      return {
        description: "detected torso movement cycles extrapolated to 60 seconds",
        value: ((motion.torsoMovementCycles ?? 0) * 60) / motion.observedDurationSeconds,
      };
    case "endurance-run":
      return {
        description: "pose travel proxy normalized to the athlete height (uncalibrated)",
        value: motion.horizontalTravelBodyHeights * heightMetres * 90,
      };
    default:
      return null;
  }
}

function rangeNormalizedScore(value: number, minimum: number, maximum: number, lowerIsBetter: boolean) {
  const position = lowerIsBetter
    ? (maximum - value) / (maximum - minimum)
    : (value - minimum) / (maximum - minimum);
  return Math.round(15 + Math.max(0, Math.min(1, position)) * 85);
}

function roundToStep(value: number, step: number) {
  const decimals = Math.max(0, String(step).split(".")[1]?.length ?? 0);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}