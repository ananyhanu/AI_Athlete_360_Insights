import {
  assessmentAttemptDraftSchema,
  assessmentAttemptSchema,
  assessmentEvaluationSchema,
  coachMetricValidationSchema,
  type AssessmentAttempt,
  type AssessmentReviewStatus,
  type CoachMetricValidation,
} from "./assessment-domain";
import { createAuthenticatedApiClient } from "./persistence-client";
import { HttpAssessmentRepository } from "./assessment-repository";

export class PersistentAssessmentRepository {
  private readonly remoteRepository = new HttpAssessmentRepository(createAuthenticatedApiClient());

  constructor(private readonly athleteId: string) {}

  async create(draft: unknown): Promise<AssessmentAttempt> {
    const parsedDraft = assessmentAttemptDraftSchema.parse(draft);
    const timestamp = new Date().toISOString();
    const attempt = assessmentAttemptSchema.parse({
      ...parsedDraft,
      createdAt: timestamp,
      dataStatus: "provisional",
      id: crypto.randomUUID(),
      lastSyncError: null,
      reviewStatus: "awaiting-coach-review",
      syncAttempts: 0,
      syncState: "synced",
      updatedAt: timestamp,
      version: 1,
    });
    return this.remoteRepository.upsert(attempt, `${attempt.id}:v${attempt.version}`);
  }

  async getById(id: string): Promise<AssessmentAttempt | null> {
    const attempts = await this.listForAthlete();
    return attempts.find((attempt) => attempt.id === id) ?? null;
  }

  async latestFor(testId: string): Promise<AssessmentAttempt | null> {
    const attempts = await this.listForAthlete();
    return attempts.find((attempt) => attempt.testId === testId) ?? null;
  }

  async listForAthlete(): Promise<readonly AssessmentAttempt[]> {
    return this.remoteRepository.listForAthlete(this.athleteId);
  }

  async updateReviewStatus(
    id: string,
    reviewStatus: AssessmentReviewStatus,
    version: number,
  ): Promise<AssessmentAttempt> {
    const current = await this.requireCurrent(id, version);
    if (
      reviewStatus === "accepted" &&
      (!current.measurement ||
        current.evaluation?.score === null ||
        current.evaluation?.score === undefined ||
        !current.evaluation.level ||
        current.evaluation.level === "Not scored" ||
        current.evaluation.source !== "coach-validated")
    ) {
      throw new Error("A coach-validated measurement, rating, and score are required before acceptance.");
    }
    return this.saveNext({ ...current, reviewStatus });
  }

  async updateCoachMetricValidation(
    id: string,
    validation: CoachMetricValidation,
    version: number,
  ): Promise<AssessmentAttempt> {
    const current = await this.requireCurrent(id, version);
    const parsedValidation = coachMetricValidationSchema.parse(validation);
    if (current.evaluation?.state === "invalid-capture") {
      throw new Error("An invalid capture must be retaken before it can be coach validated.");
    }
    const validationReason = `Coach verified ${parsedValidation.measurement.label}: ${parsedValidation.measurement.value} ${parsedValidation.measurement.unit}; performance score ${parsedValidation.score}/100 (${parsedValidation.level}).`;
    const evaluation = assessmentEvaluationSchema.parse({
      level: parsedValidation.level,
      measurement: parsedValidation.measurement,
      poseEvidence: current.evaluation?.poseEvidence ?? null,
      score: parsedValidation.score,
      source: "coach-validated",
      state: "requires-coach-review",
      validationReasons: [...(current.evaluation?.validationReasons ?? []).slice(0, 11), validationReason],
    });
    return this.saveNext({ ...current, evaluation, measurement: parsedValidation.measurement });
  }

  async updateGeneratedEvaluation(
    id: string,
    evaluation: AssessmentAttempt["evaluation"],
    version: number,
  ): Promise<AssessmentAttempt> {
    const current = await this.requireCurrent(id, version);
    const parsedEvaluation = assessmentEvaluationSchema.parse(evaluation);
    if (current.reviewStatus !== "awaiting-coach-review" || !current.captureId) {
      throw new Error("Only a saved capture awaiting coach review can be re-analyzed.");
    }
    return this.saveNext({
      ...current,
      evaluation: parsedEvaluation,
      measurement: parsedEvaluation.measurement,
      status: parsedEvaluation.state === "invalid-capture" ? "invalid" : "captured",
    });
  }

  async delete(id: string): Promise<void> {
    await this.remoteRepository.delete(this.athleteId, id);
  }

  private async requireCurrent(id: string, version: number): Promise<AssessmentAttempt> {
    const current = await this.getById(id);
    if (!current || current.version !== version) {
      throw new Error("This assessment attempt changed elsewhere. Refresh before saving again.");
    }
    return current;
  }

  private async saveNext(current: AssessmentAttempt): Promise<AssessmentAttempt> {
    const next = assessmentAttemptSchema.parse({
      ...current,
      lastSyncError: null,
      syncState: "synced",
      updatedAt: new Date().toISOString(),
      version: current.version + 1,
    });
    return this.remoteRepository.upsert(next, `${next.id}:v${next.version}`);
  }
}
