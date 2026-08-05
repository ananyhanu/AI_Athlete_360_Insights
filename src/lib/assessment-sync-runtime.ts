import { ApiClient } from "./api-client";
import { HttpAssessmentRepository } from "./assessment-repository";
import { AssessmentSyncService, type AssessmentSyncResult } from "./assessment-sync-service";
import { LocalAssessmentRepository } from "./local-assessment-repository";
import { getServerAccessToken } from "./prototype-session";

export type ConfiguredAssessmentSyncResult =
  | { configured: false; reason: "authentication-required" | "missing-api-url" }
  | ({ configured: true } & AssessmentSyncResult);

let activeSynchronization: Promise<ConfiguredAssessmentSyncResult> | undefined;

export function assessmentApiBaseUrl(value = import.meta.env["VITE_ASSESSMENT_API_URL"]) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value);
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function syncConfiguredAssessments(): Promise<ConfiguredAssessmentSyncResult> {
  if (activeSynchronization) return activeSynchronization;

  activeSynchronization = synchronizeConfiguredAssessments().finally(() => {
    activeSynchronization = undefined;
  });
  return activeSynchronization;
}

export function shouldAttemptAutomaticSync(
  isOnline: boolean,
  apiUrl?: string,
  accessToken = getServerAccessToken(),
) {
  return isOnline && Boolean(accessToken) && assessmentApiBaseUrl(apiUrl) !== null;
}

async function synchronizeConfiguredAssessments(): Promise<ConfiguredAssessmentSyncResult> {
  const baseUrl = assessmentApiBaseUrl();
  if (!baseUrl) return { configured: false, reason: "missing-api-url" };
  if (!getServerAccessToken()) return { configured: false, reason: "authentication-required" };

  const localRepository = new LocalAssessmentRepository();
  try {
    const remoteRepository = new HttpAssessmentRepository(
      new ApiClient({ baseUrl, getAccessToken: getServerAccessToken }),
    );
    const syncService = new AssessmentSyncService(localRepository, remoteRepository);
    return { configured: true, ...(await syncService.syncUnsynced()) };
  } finally {
    localRepository.close();
  }
}