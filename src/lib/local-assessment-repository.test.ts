import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageKey } from "./encrypted-json";
import { LocalAssessmentRepository } from "./local-assessment-repository";
import type { StorageKeyProvider } from "./local-athlete-repository";

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((databaseName) => Dexie.delete(databaseName)));
});

describe("local assessment repository", () => {
  it("persists an encrypted manual assessment across repository instances", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const keyProvider = createMemoryKeyProvider();
    const repository = new LocalAssessmentRepository({
      createId: () => "e350d86e-7eaf-4dc1-9031-706a4f3672fe",
      databaseName,
      keyProvider,
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });

    const saved = await repository.create({
      athleteId: "athlete-001",
      captureId: null,
      measurement: { label: "Height", unit: "cm", value: 180.5 },
      source: "manual",
      status: "completed",
      testId: "height",
    });
    repository.close();

    const reopenedRepository = new LocalAssessmentRepository({ databaseName, keyProvider });
    const loaded = await reopenedRepository.getById(saved.id);

    expect(loaded).toMatchObject({
      athleteId: "athlete-001",
      dataStatus: "provisional",
      measurement: { label: "Height", unit: "cm", value: 180.5 },
      reviewStatus: "awaiting-coach-review",
      status: "completed",
      testId: "height",
      version: 1,
    });
    reopenedRepository.close();
  });

  it("requires a measurement for a manual assessment", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });

    await expect(
      repository.create({
        athleteId: "athlete-001",
        captureId: null,
        measurement: null,
        source: "manual",
        status: "completed",
        testId: "height",
      }),
    ).rejects.toThrow("Manual assessments require a recorded measurement.");
    repository.close();
  });

  it("updates coach review status with optimistic concurrency", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      createId: () => "d6073f2b-d2f0-4156-91d4-f0e1f80ff8a4",
      databaseName,
      keyProvider: createMemoryKeyProvider(),
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });
    const saved = await repository.create({
      athleteId: "athlete-001",
      captureId: null,
      measurement: { label: "Weight", unit: "kg", value: 61 },
      source: "manual",
      status: "completed",
      testId: "weight",
    });

    await expect(
      repository.updateReviewStatus(saved.id, "accepted", saved.version),
    ).rejects.toThrow("A coach-validated measurement, rating, and score are required before acceptance.");

    const validated = await repository.updateCoachMetricValidation(
      saved.id,
      {
        level: "Good",
        measurement: { label: "Weight", unit: "kg", value: 61 },
        score: 72,
      },
      saved.version,
    );
    const accepted = await repository.updateReviewStatus(saved.id, "accepted", validated.version);

    expect(accepted.reviewStatus).toBe("accepted");
    expect(accepted.version).toBe(3);
    await expect(
      repository.updateReviewStatus(saved.id, "rejected", saved.version),
    ).rejects.toThrow("This assessment attempt changed elsewhere.");
    repository.close();
  });

  it("persists a coach-validated video metric and performance score", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });
    const saved = await repository.create({
      athleteId: "athlete-001",
      captureId: "5d9d13d0-2cc5-4de1-a487-8eb10f563807",
      evaluation: {
        level: "Not scored",
        measurement: null,
        poseEvidence: null,
        score: null,
        source: "mediapipe-pose",
        state: "requires-coach-review",
        validationReasons: ["Pose quality is suitable for coach review."],
      },
      measurement: null,
      source: "upload",
      status: "captured",
      testId: "vertical-jump",
    });

    const validated = await repository.updateCoachMetricValidation(
      saved.id,
      {
        level: "Good",
        measurement: { label: "Standing Vertical Jump", unit: "cm", value: 52.5 },
        score: 78,
      },
      saved.version,
    );

    expect(validated).toMatchObject({
      measurement: { label: "Standing Vertical Jump", unit: "cm", value: 52.5 },
      evaluation: { level: "Good", score: 78, source: "coach-validated" },
      reviewStatus: "awaiting-coach-review",
      version: 2,
    });
    expect((await repository.listAuditEventsForAttempt(saved.id)).map((event) => event.action)).toContain(
      "assessment-coach-validated",
    );
    repository.close();
  });

  it("replaces an unscored video evaluation with a regenerated AI estimate", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });
    const saved = await repository.create({
      athleteId: "athlete-001",
      captureId: "5d9d13d0-2cc5-4de1-a487-8eb10f563807",
      evaluation: {
        level: null,
        measurement: null,
        poseEvidence: null,
        score: null,
        source: "analysis-unavailable",
        state: "invalid-capture",
        validationReasons: ["The initial AI analysis failed."],
      },
      measurement: null,
      source: "upload",
      status: "invalid",
      testId: "sit-and-reach",
    });

    const regenerated = await repository.updateGeneratedEvaluation(
      saved.id,
      {
        level: "Average",
        measurement: { label: "Sit & Reach", unit: "cm", value: 31.5 },
        poseEvidence: null,
        score: 60,
        source: "mediapipe-pose",
        state: "requires-coach-review",
        validationReasons: ["AI regenerated a range-validated estimate."],
      },
      saved.version,
    );

    expect(regenerated).toMatchObject({
      evaluation: { level: "Average", score: 60, source: "mediapipe-pose" },
      measurement: { label: "Sit & Reach", unit: "cm", value: 31.5 },
      status: "captured",
      version: 2,
    });
    repository.close();
  });

  it("requires a coach to confirm an AI estimate before acceptance", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });
    const saved = await repository.create({
      athleteId: "athlete-001",
      captureId: "5d9d13d0-2cc5-4de1-a487-8eb10f563807",
      evaluation: {
        level: "Good",
        measurement: { label: "30m Sprint", unit: "s", value: 7.4 },
        poseEvidence: null,
        score: 78,
        source: "mediapipe-pose",
        state: "requires-coach-review",
        validationReasons: ["AI estimate is within the configured range."],
      },
      measurement: { label: "30m Sprint", unit: "s", value: 7.4 },
      source: "upload",
      status: "captured",
      testId: "30m-sprint",
    });

    await expect(repository.updateReviewStatus(saved.id, "accepted", saved.version)).rejects.toThrow(
      "A coach-validated measurement, rating, and score are required before acceptance.",
    );
    repository.close();
  });

  it("preserves a coach review revision when synchronization metadata changes first", async () => {
    const databaseName = `ai-athlete-assessment-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAssessmentRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });
    const saved = await repository.create({
      athleteId: "athlete-001",
      captureId: null,
      measurement: { label: "Height", unit: "cm", value: 172 },
      source: "manual",
      status: "completed",
      testId: "height",
    });
    const synchronized = await repository.updateSyncState(
      saved.id,
      "synced",
      saved.version,
      null,
    );
    const validated = await repository.updateCoachMetricValidation(
      saved.id,
      {
        level: "Good",
        measurement: { label: "Height", unit: "cm", value: 172 },
        score: 72,
      },
      saved.version,
    );
    const reviewed = await repository.updateReviewStatus(saved.id, "accepted", validated.version);

    expect(synchronized.version).toBe(saved.version);
    expect(synchronized.syncState).toBe("synced");
    expect(synchronized.syncAttempts).toBe(1);
    expect(reviewed).toMatchObject({ reviewStatus: "accepted", version: 3 });
    repository.close();
  });
});

function createMemoryKeyProvider(): StorageKeyProvider {
  let key: CryptoKey | undefined;

  return {
    async getKey() {
      key ??= await createStorageKey();
      return key;
    },
  };
}
