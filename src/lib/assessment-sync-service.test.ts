import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { AssessmentAttempt } from "./assessment-domain";
import type { AssessmentRepository } from "./assessment-repository";
import { assessmentIdempotencyKey, AssessmentSyncService } from "./assessment-sync-service";
import { createStorageKey } from "./encrypted-json";
import { LocalAssessmentRepository } from "./local-assessment-repository";
import type { StorageKeyProvider } from "./local-athlete-repository";

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((databaseName) => Dexie.delete(databaseName)));
});

describe("assessment sync service", () => {
  it("acknowledges successful upserts and persists failed retries", async () => {
    const databaseName = `ai-athlete-sync-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      createId: (() => {
        let count = 0;
        return () => `00000000-0000-4000-8000-${String(++count).padStart(12, "0")}`;
      })(),
      databaseName,
      keyProvider: createMemoryKeyProvider(),
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });
    const successfulDraft = await createManualAttempt(repository, "height", 180);
    const failingDraft = await createManualAttempt(repository, "weight", 61);
    const successfulValidated = await repository.updateCoachMetricValidation(
      successfulDraft.id,
      {
        level: "Good",
        measurement: { label: "height", unit: "cm", value: 180 },
        score: 70,
      },
      successfulDraft.version,
    );
    const failingValidated = await repository.updateCoachMetricValidation(
      failingDraft.id,
      {
        level: "Good",
        measurement: { label: "weight", unit: "cm", value: 61 },
        score: 70,
      },
      failingDraft.version,
    );
    const successful = await repository.updateReviewStatus(
      successfulValidated.id,
      "accepted",
      successfulValidated.version,
    );
    const failing = await repository.updateReviewStatus(
      failingValidated.id,
      "accepted",
      failingValidated.version,
    );
    const idempotencyKeys: string[] = [];
    const remoteRepository: AssessmentRepository = {
      async upsert(attempt, idempotencyKey) {
        idempotencyKeys.push(idempotencyKey);
        if (attempt.id === failing.id) throw new Error("Network unavailable");
        return attempt;
      },
    };

    const result = await new AssessmentSyncService(repository, remoteRepository).syncUnsynced();
    const synced = await repository.getById(successful.id);
    const failed = await repository.getById(failing.id);

    expect(result).toEqual({ failed: 1, synced: 1 });
    expect(synced).toMatchObject({ lastSyncError: null, syncAttempts: 1, syncState: "synced" });
    expect(failed).toMatchObject({
      lastSyncError: "Network unavailable",
      syncAttempts: 1,
      syncState: "failed",
    });
    expect(idempotencyKeys).toEqual([
      assessmentIdempotencyKey(successful),
      assessmentIdempotencyKey(failing),
    ]);
    repository.close();
  });
});

async function createManualAttempt(
  repository: LocalAssessmentRepository,
  testId: string,
  value: number,
) {
  return repository.create({
    athleteId: "athlete-001",
    captureId: null,
    measurement: { label: testId, unit: "cm", value },
    source: "manual",
    status: "completed",
    testId,
  });
}

function createMemoryKeyProvider(): StorageKeyProvider {
  let key: CryptoKey | undefined;

  return {
    async getKey() {
      key ??= await createStorageKey();
      return key;
    },
  };
}