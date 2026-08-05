import { assessmentApiBaseUrl } from "./assessment-sync-runtime";
import { ApiClient } from "./api-client";
import { HttpAthleteRepository } from "./athlete-repository";
import { AthleteSyncService, type AthleteSyncResult } from "./athlete-sync-service";
import { LocalAthleteRepository } from "./local-athlete-repository";
import { getServerAccessToken } from "./prototype-session";

export type ConfiguredAthleteSyncResult =
  | { configured: false; reason: "authentication-required" | "missing-api-url" }
  | ({ configured: true } & AthleteSyncResult);

let activeSynchronization: Promise<ConfiguredAthleteSyncResult> | undefined;

export async function syncConfiguredAthletes(): Promise<ConfiguredAthleteSyncResult> {
  if (activeSynchronization) return activeSynchronization;

  activeSynchronization = synchronizeConfiguredAthletes().finally(() => {
    activeSynchronization = undefined;
  });
  return activeSynchronization;
}

async function synchronizeConfiguredAthletes(): Promise<ConfiguredAthleteSyncResult> {
  const baseUrl = assessmentApiBaseUrl();
  if (!baseUrl) return { configured: false, reason: "missing-api-url" };
  if (!getServerAccessToken()) return { configured: false, reason: "authentication-required" };

  const localRepository = new LocalAthleteRepository();
  try {
    const remoteRepository = new HttpAthleteRepository(
      new ApiClient({ baseUrl, getAccessToken: getServerAccessToken }),
    );
    return { configured: true, ...(await new AthleteSyncService(localRepository, remoteRepository).syncUnsynced()) };
  } finally {
    localRepository.close();
  }
}