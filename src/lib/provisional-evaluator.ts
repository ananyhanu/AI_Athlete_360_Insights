import {
  assessmentEvaluationSchema,
  type AssessmentEvaluation,
} from "./assessment-domain";
import { estimateAiMeasurement } from "./ai-measurement";
import type { BatteryTest } from "./battery-tests";
import { poseQualityIsUsable, type PoseAnalysis } from "./mediapipe-pose-analysis";

export type CaptureProtocolEvidence = {
  athleteHeightCm?: number;
  durationSeconds: number;
  mimeType: string;
};

export function evaluateProvisionalCapture(
  test: BatteryTest,
  capture: CaptureProtocolEvidence,
  poseAnalysis?: PoseAnalysis,
): AssessmentEvaluation {
  const invalidReasons = captureValidationReasons(capture);
  if (invalidReasons.length > 0) {
    return assessmentEvaluationSchema.parse({
      level: null,
      measurement: null,
      poseEvidence: null,
      score: null,
      source: "analysis-unavailable",
      state: "invalid-capture",
      validationReasons: invalidReasons,
    });
  }

  if (poseAnalysis?.status === "analyzed") {
    const { evidence } = poseAnalysis;
    if (!poseQualityIsUsable(evidence)) {
      return assessmentEvaluationSchema.parse({
        level: null,
        measurement: null,
        poseEvidence: evidence,
        score: null,
        source: "mediapipe-pose",
        state: "invalid-capture",
        validationReasons: [
          `Pose landmarks were detected in ${evidence.detectedFrames} of ${evidence.analyzedFrames} sampled frames.`,
          `Mean landmark visibility was ${evidence.meanLandmarkVisibility.toFixed(2)} and body-in-frame rate was ${evidence.bodyInFrameRate.toFixed(2)}.`,
          "The capture does not meet the configured pose-quality threshold. Retake the video with the athlete fully visible.",
        ],
      });
    }

    const aiMeasurement = estimateAiMeasurement(test, poseAnalysis.motion, capture.athleteHeightCm);
    if (aiMeasurement.status === "estimated") {
      const { estimate } = aiMeasurement;
      return assessmentEvaluationSchema.parse({
        level: estimate.level,
        measurement: estimate.measurement,
        poseEvidence: evidence,
        score: estimate.score,
        source: "mediapipe-pose",
        state: "requires-coach-review",
        validationReasons: [
          `MediaPipe analyzed ${evidence.analyzedFrames} video frames with ${evidence.meanLandmarkVisibility.toFixed(2)} mean landmark visibility.`,
          estimate.validationReason,
          `AI provisional range-normalized score: ${estimate.score}/100 (${estimate.level}).`,
        ],
      });
    }

    return assessmentEvaluationSchema.parse({
      level: "Not scored",
      measurement: null,
      poseEvidence: evidence,
      score: null,
      source: "mediapipe-pose",
      state: "requires-coach-review",
      validationReasons: [
        `MediaPipe analyzed ${evidence.analyzedFrames} video frames with ${evidence.meanLandmarkVisibility.toFixed(2)} mean landmark visibility.`,
        aiMeasurement.reason,
      ],
    });
  }

  return assessmentEvaluationSchema.parse({
    level: null,
    measurement: null,
    poseEvidence: null,
    score: null,
    source: "analysis-unavailable",
    state: "invalid-capture",
    validationReasons: [
      ...(poseAnalysis?.reason ? [`Pose analysis was unavailable: ${poseAnalysis.reason}`] : []),
      "No AI measurement was generated from this video. Retake the capture with a browser-supported video format.",
    ],
  });
}

function captureValidationReasons(capture: CaptureProtocolEvidence) {
  const reasons: string[] = [];
  if (!capture.mimeType.startsWith("video/")) reasons.push("The selected capture is not a video file.");
  if (!Number.isFinite(capture.durationSeconds) || capture.durationSeconds < 1) {
    reasons.push("The recording must contain at least one second of video.");
  }
  return reasons;
}

