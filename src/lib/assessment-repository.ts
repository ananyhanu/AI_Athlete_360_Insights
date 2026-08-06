import { z } from "zod";
import { ApiClient } from "./api-client";
import { assessmentAttemptSchema, type AssessmentAttempt } from "./assessment-domain";

export interface AssessmentRepository {
  upsert(attempt: AssessmentAttempt, idempotencyKey: string): Promise<AssessmentAttempt>;
}

export interface AssessmentCrudRepository extends AssessmentRepository {
  delete(athleteId: string, attemptId: string): Promise<void>;
  listForAthlete(athleteId: string): Promise<readonly AssessmentAttempt[]>;
}

export class HttpAssessmentRepository implements AssessmentCrudRepository {
  constructor(private readonly apiClient: ApiClient) {}

  async upsert(attempt: AssessmentAttempt, idempotencyKey: string) {
    const payload = await this.apiClient.request<unknown>("/v1/assessment-attempts", {
      body: attempt,
      idempotencyKey,
      method: "POST",
    });

    return assessmentAttemptSchema.parse(payload);
  }

  async delete(athleteId: string, attemptId: string) {
    await this.apiClient.request<void>(
      `/v1/athletes/${encodeURIComponent(athleteId)}/assessment-attempts/${encodeURIComponent(attemptId)}`,
      { method: "DELETE" },
    );
  }

  async listForAthlete(athleteId: string) {
    const payload = await this.apiClient.request<unknown>(
      `/v1/athletes/${encodeURIComponent(athleteId)}/assessment-attempts`,
    );
    return z.array(assessmentAttemptSchema).parse(payload);
  }
}