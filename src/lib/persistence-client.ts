import { ApiClient } from "./api-client";
import { assessmentApiBaseUrl } from "./assessment-sync-runtime";
import { getServerAccessToken } from "./prototype-session";

export function createAuthenticatedApiClient(): ApiClient {
  const baseUrl = assessmentApiBaseUrl();
  if (!baseUrl || !getServerAccessToken()) {
    throw new Error("Sign in to the persistence API before managing athlete data.");
  }
  return new ApiClient({ baseUrl, getAccessToken: getServerAccessToken });
}
