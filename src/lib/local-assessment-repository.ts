import Dexie, { type Table } from "dexie";
import {
  assessmentAuditEventSchema,
  assessmentAttemptDraftSchema,
  assessmentAttemptSchema,
  assessmentEvaluationSchema,
  coachMetricValidationSchema,
  type AssessmentAuditAction,
  type AssessmentAuditEvent,
  type AssessmentAttempt,
  type AssessmentAttemptDraft,
  type CoachMetricValidation,
  type AssessmentReviewStatus,
} from "./assessment-domain";
import { createStorageKey, decryptJson, encryptJson, type EncryptedJson } from "./encrypted-json";
import type { StorageKeyProvider } from "./local-athlete-repository";

type EncryptedAssessmentAttempt = {
  id: string;
  payload: EncryptedJson;
};

type EncryptedAssessmentAuditEvent = {
  id: string;
  payload: EncryptedJson;
  sequence: number;
};

type StorageKey = {
  id: string;
  key: CryptoKey;
};

export const assessmentAttemptChangedEvent = "aa360:assessment-attempt-changed";

export type LocalAssessmentRepositoryOptions = {
  createId?: () => string;
  databaseName?: string;
  keyProvider?: StorageKeyProvider;
  now?: () => Date;
};

export class AssessmentAttemptVersionConflictError extends Error {
  constructor() {
    super("This assessment attempt changed elsewhere. Refresh before saving again.");
    this.name = "AssessmentAttemptVersionConflictError";
  }
}

export class LocalAssessmentRepository {
  private readonly createId: () => string;
  private readonly database: AssessmentDatabase;
  private readonly now: () => Date;
  private readonly storageKey: Promise<CryptoKey>;

  constructor(options: LocalAssessmentRepositoryOptions = {}) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.database = new AssessmentDatabase(options.databaseName ?? "ai-athlete-360-assessments");
    this.now = options.now ?? (() => new Date());
    this.storageKey = (
      options.keyProvider ?? new IndexedDbStorageKeyProvider(this.database)
    ).getKey();
  }

  async create(draft: unknown): Promise<AssessmentAttempt> {
    const parsedDraft = assessmentAttemptDraftSchema.parse(draft);
    const timestamp = this.now().toISOString();
    const attempt = assessmentAttemptSchema.parse({
      ...parsedDraft,
      createdAt: timestamp,
      dataStatus: "provisional",
      id: this.createId(),
      reviewStatus: "awaiting-coach-review",
      updatedAt: timestamp,
      version: 1,
    });

    await this.put(attempt);
    await this.recordAuditEvent({
      action: "assessment-created",
      actor: "system",
      athleteId: attempt.athleteId,
      attemptId: attempt.id,
      details: { source: attempt.source, testId: attempt.testId },
    });
    if (attempt.evaluation) {
      await this.recordAuditEvent({
        action: "assessment-evaluated",
        actor: "system",
        athleteId: attempt.athleteId,
        attemptId: attempt.id,
        details: {
          evaluationState: attempt.evaluation.state,
          score: attempt.evaluation.score,
          source: attempt.evaluation.source,
        },
      });
    }
    notifyAttemptChange();
    return attempt;
  }

  async getById(id: string): Promise<AssessmentAttempt | null> {
    const stored = await this.database.attempts.get(id);
    return stored ? this.decrypt(stored) : null;
  }

  async latestFor(athleteId: string, testId: string): Promise<AssessmentAttempt | null> {
    const attempts = await this.listForAthlete(athleteId);
    return attempts.find((attempt) => attempt.testId === testId) ?? null;
  }

  async listForAthlete(athleteId: string): Promise<readonly AssessmentAttempt[]> {
    const records = await this.database.attempts.toArray();
    const attempts = await Promise.all(records.map((record) => this.decrypt(record)));

    return attempts
      .filter((attempt) => attempt.athleteId === athleteId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listUnsynced(): Promise<readonly AssessmentAttempt[]> {
    const records = await this.database.attempts.toArray();
    const attempts = await Promise.all(records.map((record) => this.decrypt(record)));

    return attempts
      .filter(
        (attempt) =>
          attempt.syncState !== "synced" && attempt.reviewStatus !== "awaiting-coach-review",
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async listAuditEventsForAttempt(id: string): Promise<readonly AssessmentAuditEvent[]> {
    const records = await this.database.auditEvents.toArray();
    const events = await Promise.all(
      records.map(async (record) => ({
        event: await this.decryptAuditEvent(record),
        sequence: record.sequence,
      })),
    );

    return events
      .filter(({ event }) => event.attemptId === id)
      .sort((left, right) => left.sequence - right.sequence)
      .map(({ event }) => event);
  }

  async updateReviewStatus(
    id: string,
    reviewStatus: AssessmentReviewStatus,
    version: number,
  ): Promise<AssessmentAttempt> {
    const updatedAttempt = await this.database.transaction("rw", this.database.attempts, async () => {
      const stored = await this.database.attempts.get(id);
      if (!stored) throw new AssessmentAttemptVersionConflictError();

      const current = await Dexie.waitFor(this.decrypt(stored));
      if (current.version !== version) throw new AssessmentAttemptVersionConflictError();
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

      const attempt = assessmentAttemptSchema.parse({
        ...current,
        reviewStatus,
        updatedAt: this.now().toISOString(),
        version: current.version + 1,
      });

      const key = await Dexie.waitFor(this.storageKey);
      const payload = await Dexie.waitFor(encryptJson(attempt, key));
      await this.database.attempts.put({ id: attempt.id, payload });
      return attempt;
    });
    await this.recordAuditEvent({
      action: "assessment-reviewed",
      actor: "coach",
      athleteId: updatedAttempt.athleteId,
      attemptId: updatedAttempt.id,
      details: { reviewStatus: updatedAttempt.reviewStatus },
    });
    notifyAttemptChange();
    return updatedAttempt;
  }

  async updateCoachMetricValidation(
    id: string,
    validation: CoachMetricValidation,
    version: number,
  ): Promise<AssessmentAttempt> {
    const parsedValidation = coachMetricValidationSchema.parse(validation);
    const updatedAttempt = await this.database.transaction("rw", this.database.attempts, async () => {
      const stored = await this.database.attempts.get(id);
      if (!stored) throw new AssessmentAttemptVersionConflictError();

      const current = await Dexie.waitFor(this.decrypt(stored));
      if (current.version !== version) throw new AssessmentAttemptVersionConflictError();
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
        validationReasons: [
          ...(current.evaluation?.validationReasons ?? []).slice(0, 11),
          validationReason,
        ],
      });
      const attempt = assessmentAttemptSchema.parse({
        ...current,
        evaluation,
        measurement: parsedValidation.measurement,
        updatedAt: this.now().toISOString(),
        version: current.version + 1,
      });

      const key = await Dexie.waitFor(this.storageKey);
      const payload = await Dexie.waitFor(encryptJson(attempt, key));
      await this.database.attempts.put({ id: attempt.id, payload });
      return attempt;
    });
    await this.recordAuditEvent({
      action: "assessment-coach-validated",
      actor: "coach",
      athleteId: updatedAttempt.athleteId,
      attemptId: updatedAttempt.id,
      details: {
        level: parsedValidation.level,
        measurement: parsedValidation.measurement.value,
        score: parsedValidation.score,
        unit: parsedValidation.measurement.unit,
      },
    });
    notifyAttemptChange();
    return updatedAttempt;
  }

  async updateGeneratedEvaluation(
    id: string,
    evaluation: AssessmentAttempt["evaluation"],
    version: number,
  ): Promise<AssessmentAttempt> {
    const parsedEvaluation = assessmentEvaluationSchema.parse(evaluation);
    const updatedAttempt = await this.database.transaction("rw", this.database.attempts, async () => {
      const stored = await this.database.attempts.get(id);
      if (!stored) throw new AssessmentAttemptVersionConflictError();

      const current = await Dexie.waitFor(this.decrypt(stored));
      if (current.version !== version) throw new AssessmentAttemptVersionConflictError();
      if (current.reviewStatus !== "awaiting-coach-review") {
        throw new Error("Only an assessment awaiting coach review can be re-analyzed.");
      }
      if (!current.captureId) {
        throw new Error("Only a saved video capture can be re-analyzed.");
      }

      const attempt = assessmentAttemptSchema.parse({
        ...current,
        evaluation: parsedEvaluation,
        measurement: parsedEvaluation.measurement,
        status: parsedEvaluation.state === "invalid-capture" ? "invalid" : "captured",
        updatedAt: this.now().toISOString(),
        version: current.version + 1,
      });

      const key = await Dexie.waitFor(this.storageKey);
      const payload = await Dexie.waitFor(encryptJson(attempt, key));
      await this.database.attempts.put({ id: attempt.id, payload });
      return attempt;
    });
    await this.recordAuditEvent({
      action: "assessment-evaluated",
      actor: "system",
      athleteId: updatedAttempt.athleteId,
      attemptId: updatedAttempt.id,
      details: {
        evaluationState: parsedEvaluation.state,
        score: parsedEvaluation.score,
        source: parsedEvaluation.source,
      },
    });
    notifyAttemptChange();
    return updatedAttempt;
  }

  async updateSyncState(
    id: string,
    syncState: "failed" | "synced",
    version: number,
    lastSyncError: string | null,
  ): Promise<AssessmentAttempt> {
    const updatedAttempt = await this.database.transaction("rw", this.database.attempts, async () => {
      const stored = await this.database.attempts.get(id);
      if (!stored) throw new AssessmentAttemptVersionConflictError();

      const current = await Dexie.waitFor(this.decrypt(stored));
      if (current.version !== version) throw new AssessmentAttemptVersionConflictError();

      const attempt = assessmentAttemptSchema.parse({
        ...current,
        lastSyncError,
        syncAttempts: current.syncAttempts + 1,
        syncState,
        updatedAt: this.now().toISOString(),
        version: current.version,
      });

      const key = await Dexie.waitFor(this.storageKey);
      const payload = await Dexie.waitFor(encryptJson(attempt, key));
      await this.database.attempts.put({ id: attempt.id, payload });
      return attempt;
    });
    await this.recordAuditEvent({
      action: syncState === "synced" ? "assessment-sync-succeeded" : "assessment-sync-failed",
      actor: "system",
      athleteId: updatedAttempt.athleteId,
      attemptId: updatedAttempt.id,
      details: { syncAttempts: updatedAttempt.syncAttempts, syncState: updatedAttempt.syncState },
    });
    notifyAttemptChange();
    return updatedAttempt;
  }

  async recordAuditEvent({
    action,
    actor,
    athleteId,
    attemptId,
    details,
  }: {
    action: AssessmentAuditAction;
    actor: "coach" | "system";
    athleteId: string;
    attemptId: string | null;
    details: Record<string, string | number | boolean | null>;
  }): Promise<AssessmentAuditEvent> {
    return this.database.transaction("rw", this.database.auditEvents, async () => {
      const lastRecord = await this.database.auditEvents.orderBy("sequence").last();
      const event = assessmentAuditEventSchema.parse({
        action,
        actor,
        athleteId,
        attemptId,
        details,
        id: crypto.randomUUID(),
        occurredAt: this.now().toISOString(),
      });
      const key = await Dexie.waitFor(this.storageKey);
      const payload = await Dexie.waitFor(encryptJson(event, key));
      await this.database.auditEvents.put({
        id: event.id,
        payload,
        sequence: (lastRecord?.sequence ?? 0) + 1,
      });
      return event;
    });
  }

  close() {
    this.database.close();
  }

  private async decrypt(stored: EncryptedAssessmentAttempt) {
    return assessmentAttemptSchema.parse(await decryptJson(stored.payload, await this.storageKey));
  }

  private async decryptAuditEvent(stored: EncryptedAssessmentAuditEvent) {
    return assessmentAuditEventSchema.parse(
      await decryptJson(stored.payload, await this.storageKey),
    );
  }

  private async put(attempt: AssessmentAttempt) {
    const payload = await encryptJson(attempt, await this.storageKey);
    await this.database.attempts.put({ id: attempt.id, payload });
  }
}

class IndexedDbStorageKeyProvider implements StorageKeyProvider {
  constructor(private readonly database: AssessmentDatabase) {}

  async getKey() {
    const stored = await this.database.keys.get("assessment-data-key");
    if (stored) return stored.key;

    const key = await createStorageKey();
    await this.database.keys.put({ id: "assessment-data-key", key });
    return key;
  }
}

class AssessmentDatabase extends Dexie {
  auditEvents!: Table<EncryptedAssessmentAuditEvent, string>;
  attempts!: Table<EncryptedAssessmentAttempt, string>;
  keys!: Table<StorageKey, string>;

  constructor(databaseName: string) {
    super(databaseName);
    this.version(1).stores({ attempts: "&id", keys: "&id" });
    this.version(2).stores({ auditEvents: "&id", attempts: "&id", keys: "&id" });
    this.version(3)
      .stores({ auditEvents: "&id, sequence", attempts: "&id", keys: "&id" })
      .upgrade((transaction) => {
        let sequence = 0;
        return transaction
          .table("auditEvents")
          .toCollection()
          .modify((record) => {
            record.sequence = ++sequence;
          });
      });
  }
}

function notifyAttemptChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(assessmentAttemptChangedEvent));
  }
}
