import { z } from "zod";
import { ApiClient } from "./api-client";
import { athleteRecordSchema, type AthleteDraft, type AthleteRecord } from "./athlete-domain";

export type AthleteUpdate = {
  changes: Partial<AthleteDraft>;
  version: number;
};

export interface AthleteRepository {
  create(draft: AthleteDraft, idempotencyKey: string): Promise<AthleteRecord>;
  getById(id: string): Promise<AthleteRecord | null>;
  list(): Promise<readonly AthleteRecord[]>;
  update(id: string, update: AthleteUpdate, idempotencyKey: string): Promise<AthleteRecord>;
}

export interface AthleteSyncRepository {
  upsert(athlete: AthleteRecord, idempotencyKey: string): Promise<AthleteRecord>;
}

export class HttpAthleteRepository implements AthleteRepository, AthleteSyncRepository {
  constructor(private readonly apiClient: ApiClient) {}

  async create(draft: AthleteDraft, idempotencyKey: string) {
    const payload = await this.apiClient.request<unknown>("/v1/athletes", {
      body: draft,
      idempotencyKey,
      method: "POST",
    });

    return athleteRecordSchema.parse(payload);
  }

  async getById(id: string) {
    try {
      const payload = await this.apiClient.request<unknown>(
        `/v1/athletes/${encodeURIComponent(id)}`,
      );
      return athleteRecordSchema.parse(payload);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list() {
    const payload = await this.apiClient.request<unknown>("/v1/athletes");
    return z.array(athleteRecordSchema).parse(payload);
  }

  async update(id: string, update: AthleteUpdate, idempotencyKey: string) {
    const payload = await this.apiClient.request<unknown>(
      `/v1/athletes/${encodeURIComponent(id)}`,
      {
        body: update,
        headers: { "If-Match": String(update.version) },
        idempotencyKey,
        method: "PATCH",
      },
    );

    return athleteRecordSchema.parse(payload);
  }

  async upsert(athlete: AthleteRecord, idempotencyKey: string) {
    const payload = await this.apiClient.request<unknown>(
      `/v1/athletes/${encodeURIComponent(athlete.id)}/sync`,
      {
        body: { ...athlete, syncState: "synced" },
        idempotencyKey,
        method: "PUT",
      },
    );

    return athleteRecordSchema.parse(payload);
  }
}

function isNotFound(error: unknown) {
  return error instanceof Error && "status" in error && error.status === 404;
}
