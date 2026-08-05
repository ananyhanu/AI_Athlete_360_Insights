import { z } from "zod";
import { ApiClient } from "./api-client";
import { assessmentAttemptSchema, type AssessmentAttempt } from "./assessment-domain";

export interface AssessmentRepository {
  upsert(attempt: AssessmentAttempt, idempotencyKey: string): Promise<AssessmentAttempt>;
}

export class HttpAssessmentRepository implements AssessmentRepository {
  constructor(private readonly apiClient: ApiClient) {}

  async upsert(attempt: AssessmentAttempt, idempotencyKey: string) {
    const payload = await this.apiClient.request<unknown>("/v1/assessment-attempts", {
      body: attempt,
      idempotencyKey,
      method: "POST",
    });

    return assessmentAttemptSchema.parse(payload);
  }

  async listForAthlete(athleteId: string) {
    const payload = await this.apiClient.request<unknown>(
      `/v1/athletes/${encodeURIComponent(athleteId)}/assessment-attempts`,
    );
    return z.array(assessmentAttemptSchema).parse(payload);
  }
}