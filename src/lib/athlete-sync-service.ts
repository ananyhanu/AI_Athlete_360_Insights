import type { AthleteRecord } from "./athlete-domain";
import type { AthleteSyncRepository } from "./athlete-repository";

export type AthleteSyncResult = {
  failed: number;
  synced: number;
};

export interface LocalAthleteSyncRepository {
  listUnsynced(): Promise<readonly AthleteRecord[]>;
  updateSyncState(id: string, syncState: "failed" | "synced"): Promise<AthleteRecord>;
}

export class AthleteSyncService {
  constructor(
    private readonly localRepository: LocalAthleteSyncRepository,
    private readonly remoteRepository: AthleteSyncRepository,
  ) {}

  async syncUnsynced(): Promise<AthleteSyncResult> {
    const athletes = await this.localRepository.listUnsynced();
    let failed = 0;
    let synced = 0;

    for (const athlete of athletes) {
      try {
        await this.remoteRepository.upsert(athlete, athleteIdempotencyKey(athlete));
        await this.localRepository.updateSyncState(athlete.id, "synced");
        synced += 1;
      } catch {
        await this.localRepository.updateSyncState(athlete.id, "failed");
        failed += 1;
      }
    }

    return { failed, synced };
  }
}

export function athleteIdempotencyKey(athlete: Pick<AthleteRecord, "id" | "version">) {
  return `${athlete.id}:v${athlete.version}`;
}