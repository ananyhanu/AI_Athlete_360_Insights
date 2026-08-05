import type { AssessmentAttempt } from "./assessment-domain";
import type { AssessmentRepository } from "./assessment-repository";
import { LocalAssessmentRepository } from "./local-assessment-repository";

export type AssessmentSyncResult = {
  failed: number;
  synced: number;
};

export class AssessmentSyncService {
  constructor(
    private readonly localRepository: LocalAssessmentRepository,
    private readonly remoteRepository: AssessmentRepository,
  ) {}

  async syncUnsynced(): Promise<AssessmentSyncResult> {
    const attempts = await this.localRepository.listUnsynced();
    let failed = 0;
    let synced = 0;

    for (const attempt of attempts) {
      // Sync sequentially so each attempt's audit trail and version transition remain deterministic.
      await this.localRepository.recordAuditEvent({
        action: "assessment-sync-attempted",
        actor: "system",
        athleteId: attempt.athleteId,
        attemptId: attempt.id,
        details: { syncAttempts: attempt.syncAttempts + 1 },
      });
      try {
        await this.remoteRepository.upsert(attempt, assessmentIdempotencyKey(attempt));
        await this.localRepository.updateSyncState(attempt.id, "synced", attempt.version, null);
        synced += 1;
      } catch (error) {
        await this.localRepository.updateSyncState(
          attempt.id,
          "failed",
          attempt.version,
          syncErrorMessage(error),
        );
        failed += 1;
      }
    }

    return { failed, synced };
  }
}

export function assessmentIdempotencyKey(attempt: AssessmentAttempt) {
  // A retry of the same local version is safe; a changed version is intentionally a new remote write.
  return `${attempt.id}:v${attempt.version}`;
}

function syncErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "The remote assessment service rejected this attempt.";
}