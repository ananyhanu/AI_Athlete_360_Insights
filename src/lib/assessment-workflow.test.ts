import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { AssessmentRepository } from "./assessment-repository";
import { AssessmentSyncService } from "./assessment-sync-service";
import { summarizeAssessment } from "./assessment-summary";
import { getBatteryTest } from "./battery-tests";
import { createStorageKey } from "./encrypted-json";
import { LocalAssessmentRepository } from "./local-assessment-repository";
import { LocalCaptureRepository } from "./local-capture-repository";
import type { StorageKeyProvider } from "./local-athlete-repository";
import { evaluateProvisionalCapture } from "./provisional-evaluator";

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((databaseName) => Dexie.delete(databaseName)));
});

describe("local assessment workflow", () => {
  it("moves a recorded capture through provisional evaluation, coach acceptance, summary, and sync", async () => {
    const captureDatabaseName = `ai-athlete-workflow-capture-${crypto.randomUUID()}`;
    const assessmentDatabaseName = `ai-athlete-workflow-assessment-${crypto.randomUUID()}`;
    databaseNames.push(captureDatabaseName, assessmentDatabaseName);
    const captureRepository = new LocalCaptureRepository({
      createId: () => "10000000-0000-4000-8000-000000000001",
      databaseName: captureDatabaseName,
      keyProvider: createMemoryKeyProvider(),
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });
    const assessmentRepository = new LocalAssessmentRepository({
      createId: () => "20000000-0000-4000-8000-000000000001",
      databaseName: assessmentDatabaseName,
      keyProvider: createMemoryKeyProvider(),
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });

    const capture = await captureRepository.save({
      athleteId: "athlete-001",
      blob: new Blob(["test-video"], { type: "video/webm" }),
      durationSeconds: 8,
      mimeType: "video/webm",
      source: "upload",
      testId: "vertical-jump",
    });
    const evaluation = evaluateProvisionalCapture(
      getBatteryTest("vertical-jump"),
      { ...capture, athleteHeightCm: 170 },
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
          horizontalDisplacementBodyHeights: 0.2,
          horizontalTravelBodyHeights: 1.1,
          observedDurationSeconds: 4,
          verticalDisplacementBodyHeights: 0.8,
          verticalRangeBodyHeights: 0.9,
          verticalTravelBodyHeights: 1.4,
          wristTravelBodyHeights: 1.2,
          torsoMovementCycles: 0,
        },
        reason: null,
        status: "analyzed",
      },
    );
    const savedAttempt = await assessmentRepository.create({
      athleteId: capture.athleteId,
      captureId: capture.id,
      evaluation,
      measurement: evaluation.measurement,
      source: capture.source,
      status: "captured",
      testId: capture.testId,
    });
    const validatedAttempt = await assessmentRepository.updateCoachMetricValidation(
      savedAttempt.id,
      {
        level: "Good",
        measurement: { label: "Standing Vertical Jump", unit: "cm", value: 48.5 },
        score: 76,
      },
      savedAttempt.version,
    );
    const acceptedAttempt = await assessmentRepository.updateReviewStatus(
      validatedAttempt.id,
      "accepted",
      validatedAttempt.version,
    );
    const summary = summarizeAssessment(await assessmentRepository.listForAthlete("athlete-001"));
    const remoteRepository: AssessmentRepository = {
      async upsert(attempt) {
        return attempt;
      },
    };

    const syncResult = await new AssessmentSyncService(
      assessmentRepository,
      remoteRepository,
    ).syncUnsynced();
    const syncedAttempt = await assessmentRepository.getById(acceptedAttempt.id);
    const auditEvents = await assessmentRepository.listAuditEventsForAttempt(acceptedAttempt.id);

    expect(summary).toMatchObject({
      accepted: 1,
      averageScore: 76,
      awaitingCoachReview: 0,
      completed: 1,
      syncPending: 1,
    });
    expect(syncResult).toEqual({ failed: 0, synced: 1 });
    expect(syncedAttempt).toMatchObject({ syncAttempts: 1, syncState: "synced" });
    expect(auditEvents.map((event) => event.action)).toEqual([
      "assessment-created",
      "assessment-evaluated",
      "assessment-coach-validated",
      "assessment-reviewed",
      "assessment-sync-attempted",
      "assessment-sync-succeeded",
    ]);

    captureRepository.close();
    assessmentRepository.close();
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