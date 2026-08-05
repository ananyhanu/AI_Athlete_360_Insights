import { z } from "zod";
import {
  coachPerformanceLevels,
  coachPerformanceScoreError,
  type CoachPerformanceLevel,
} from "./coach-performance-scoring";

export const assessmentSourceSchema = z.enum(["camera", "manual", "upload"]);
export const assessmentReviewStatusSchema = z.enum([
  "awaiting-coach-review",
  "accepted",
  "rejected",
]);
export const assessmentAttemptStatusSchema = z.enum(["captured", "completed", "invalid"]);
export const assessmentEvaluationStateSchema = z.enum([
  "invalid-capture",
  "requires-coach-review",
]);
export const assessmentSyncStateSchema = z.enum(["failed", "pending", "synced"]);
export const assessmentAuditActionSchema = z.enum([
  "assessment-coach-validated",
  "assessment-created",
  "assessment-evaluated",
  "assessment-reviewed",
  "assessment-sync-attempted",
  "assessment-sync-failed",
  "assessment-sync-succeeded",
]);

export const assessmentMeasurementSchema = z.object({
  label: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(20),
  value: z.number().finite().nonnegative().max(10_000),
});

export const coachPerformanceLevelSchema = z.enum(coachPerformanceLevels);

export const coachMetricValidationSchema = z
  .object({
    level: coachPerformanceLevelSchema,
    measurement: assessmentMeasurementSchema,
    score: z.number().int().min(0).max(100),
  })
  .superRefine((validation, context) => {
    const message = coachPerformanceScoreError(validation.score, validation.level);
    if (message) {
      context.addIssue({ code: "custom", message, path: ["score"] });
    }
  });

export const assessmentEvaluationSchema = z.object({
  level: z
    .union([coachPerformanceLevelSchema, z.literal("Not scored")])
    .nullable(),
  measurement: assessmentMeasurementSchema.nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  poseEvidence: z
    .object({
      analyzedFrames: z.number().int().positive().max(60),
      bodyInFrameRate: z.number().min(0).max(1),
      detectedFrames: z.number().int().nonnegative().max(60),
      meanLandmarkVisibility: z.number().min(0).max(1),
      model: z.literal("mediapipe-pose-landmarker-lite"),
      modelVersion: z.literal("1"),
    })
    .nullable()
    .default(null),
  source: z.enum(["analysis-unavailable", "coach-validated", "mediapipe-pose"]),
  state: assessmentEvaluationStateSchema,
  validationReasons: z.array(z.string().trim().min(1).max(240)).max(12),
});

const assessmentAttemptFieldsSchema = z.object({
  athleteId: z.string().trim().min(1).max(160),
  captureId: z.string().uuid().nullable(),
  measurement: assessmentMeasurementSchema.nullable(),
  evaluation: assessmentEvaluationSchema.nullable().default(null),
  lastSyncError: z.string().trim().min(1).max(500).nullable().default(null),
  source: assessmentSourceSchema,
  status: assessmentAttemptStatusSchema,
  syncAttempts: z.number().int().nonnegative().max(100).default(0),
  syncState: assessmentSyncStateSchema.default("pending"),
  testId: z.string().trim().min(1).max(100),
});

function validateAttempt(
  attempt: z.infer<typeof assessmentAttemptFieldsSchema>,
  context: z.RefinementCtx,
) {
  if (attempt.source === "manual" && !attempt.measurement) {
    context.addIssue({
      code: "custom",
      message: "Manual assessments require a recorded measurement.",
      path: ["measurement"],
    });
  }

  if (attempt.source !== "manual" && !attempt.captureId) {
    context.addIssue({
      code: "custom",
      message: "Captured assessments require a secure capture ID.",
      path: ["captureId"],
    });
  }
}

export const assessmentAttemptDraftSchema =
  assessmentAttemptFieldsSchema.superRefine(validateAttempt);

export const assessmentAttemptSchema = assessmentAttemptFieldsSchema
  .extend({
    createdAt: z.string().datetime(),
    dataStatus: z.literal("provisional"),
    id: z.string().uuid(),
    reviewStatus: assessmentReviewStatusSchema,
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .superRefine(validateAttempt);

export const assessmentAuditEventSchema = z.object({
  action: assessmentAuditActionSchema,
  actor: z.enum(["coach", "system"]),
  athleteId: z.string().trim().min(1).max(160),
  attemptId: z.string().uuid().nullable(),
  details: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

export type AssessmentAttempt = z.infer<typeof assessmentAttemptSchema>;
export type AssessmentAttemptDraft = z.infer<typeof assessmentAttemptDraftSchema>;
export type AssessmentAuditEvent = z.infer<typeof assessmentAuditEventSchema>;
export type AssessmentAuditAction = z.infer<typeof assessmentAuditActionSchema>;
export type AssessmentEvaluation = z.infer<typeof assessmentEvaluationSchema>;
export type CoachMetricValidation = z.infer<typeof coachMetricValidationSchema>;
export type { CoachPerformanceLevel };
export type AssessmentReviewStatus = z.infer<typeof assessmentReviewStatusSchema>;
export type AssessmentSyncState = z.infer<typeof assessmentSyncStateSchema>;
