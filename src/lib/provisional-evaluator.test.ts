import { describe, expect, it } from "vitest";
import { getBatteryTest } from "./battery-tests";
import { evaluateProvisionalCapture } from "./provisional-evaluator";

describe("provisional capture evaluator", () => {
  it("requires a retake when AI analysis is unavailable instead of persisting an unscored result", () => {
    const outcome = evaluateProvisionalCapture(getBatteryTest("vertical-jump"), {
      durationSeconds: 12,
      mimeType: "video/webm",
    }, {
      evidence: null,
      reason: "MediaPipe could not initialize for this device.",
      status: "unavailable",
    });

    expect(outcome).toMatchObject({
      level: null,
      measurement: null,
      score: null,
      source: "analysis-unavailable",
      state: "invalid-capture",
    });
    expect(outcome.validationReasons).toContain(
      "Pose analysis was unavailable: MediaPipe could not initialize for this device.",
    );
  });

  it("rejects a capture that cannot satisfy minimum video evidence", () => {
    const outcome = evaluateProvisionalCapture(getBatteryTest("sit-ups"), {
      durationSeconds: 0,
      mimeType: "image/jpeg",
    });

    expect(outcome).toMatchObject({
      level: null,
      measurement: null,
      score: null,
      state: "invalid-capture",
    });
    expect(outcome.validationReasons).toHaveLength(2);
  });

  it("persists real MediaPipe landmark evidence without inventing a performance score", () => {
    const outcome = evaluateProvisionalCapture(
      getBatteryTest("sit-ups"),
      { durationSeconds: 12, mimeType: "video/webm" },
      {
        evidence: {
          analyzedFrames: 8,
          bodyInFrameRate: 0.875,
          detectedFrames: 8,
          meanLandmarkVisibility: 0.81,
          model: "mediapipe-pose-landmarker-lite",
          modelVersion: "1",
        },
        reason: null,
        status: "analyzed",
      },
    );

    expect(outcome).toMatchObject({
      level: "Not scored",
      measurement: null,
      poseEvidence: { analyzedFrames: 8, meanLandmarkVisibility: 0.81 },
      score: null,
      source: "mediapipe-pose",
      state: "requires-coach-review",
    });
  });

  it("persists a range-validated AI sprint estimate when pose motion is available", () => {
    const outcome = evaluateProvisionalCapture(
      getBatteryTest("30m-sprint"),
      { durationSeconds: 7.4, mimeType: "video/mp4" },
      {
        evidence: {
          analyzedFrames: 16,
          bodyInFrameRate: 0.9,
          detectedFrames: 16,
          meanLandmarkVisibility: 0.85,
          model: "mediapipe-pose-landmarker-lite",
          modelVersion: "1",
        },
        motion: {
          horizontalDisplacementBodyHeights: 7.8,
          horizontalTravelBodyHeights: 8.2,
          observedDurationSeconds: 7.4,
          verticalDisplacementBodyHeights: 0.2,
          verticalTravelBodyHeights: 1.1,
          wristTravelBodyHeights: 1.8,
        },
        reason: null,
        status: "analyzed",
      },
    );

    expect(outcome).toMatchObject({
      level: "Good",
      measurement: { label: "30m Sprint", unit: "s", value: 7.4 },
      score: 78,
      source: "mediapipe-pose",
      state: "requires-coach-review",
    });
  });

  it("requires a retake when MediaPipe landmark quality is below the minimum threshold", () => {
    const outcome = evaluateProvisionalCapture(
      getBatteryTest("sit-ups"),
      { durationSeconds: 12, mimeType: "video/webm" },
      {
        evidence: {
          analyzedFrames: 8,
          bodyInFrameRate: 0.2,
          detectedFrames: 3,
          meanLandmarkVisibility: 0.4,
          model: "mediapipe-pose-landmarker-lite",
          modelVersion: "1",
        },
        reason: null,
        status: "analyzed",
      },
    );

    expect(outcome).toMatchObject({
      poseEvidence: { detectedFrames: 3 },
      score: null,
      source: "mediapipe-pose",
      state: "invalid-capture",
    });
  });
});