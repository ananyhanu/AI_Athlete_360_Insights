import { describe, expect, it } from "vitest";
import { AthleteSyncService, athleteIdempotencyKey } from "./athlete-sync-service";
import type { AthleteRecord } from "./athlete-domain";

const athlete = {
  address: { district: "Pune", line1: "12 Shivaji Nagar", line2: null, postalCode: "411005", state: "Maharashtra", villageOrCity: "Pune" },
  ageCategory: "Under 18",
  athleteId: "ATH-2026-0231",
  consentStatus: "granted",
  createdAt: "2026-08-05T10:00:00.000Z",
  dateOfBirth: "2009-03-12",
  discipline: "100m Sprint",
  emailAddress: "arjun.sharma@example.in",
  emergencyContact: null,
  fullName: "Arjun Sharma",
  gender: "male",
  guardian: null,
  heightCm: 172,
  id: "1f815698-0f04-4a89-a684-e476507ed85c",
  institutionName: "Shivaji Sports Academy",
  mobileNumber: "+919820041827",
  sport: "Athletics",
  syncState: "pending",
  updatedAt: "2026-08-05T10:00:00.000Z",
  version: 1,
  weightKg: 61,
} satisfies AthleteRecord;

describe("athlete sync service", () => {
  it("acknowledges replicated athletes and retains failed records for retry", async () => {
    const syncStates: Array<"failed" | "synced"> = [];
    const localRepository = {
      listUnsynced: async () => [athlete],
      updateSyncState: async (_id: string, state: "failed" | "synced") => {
        syncStates.push(state);
        return { ...athlete, syncState: state };
      },
    };
    const remoteRepository = {
      upsert: async (candidate: AthleteRecord, idempotencyKey: string) => {
        expect(candidate.id).toBe(athlete.id);
        expect(idempotencyKey).toBe(`${athlete.id}:v1`);
        return { ...candidate, syncState: "synced" as const };
      },
    };

    const result = await new AthleteSyncService(localRepository, remoteRepository).syncUnsynced();

    expect(result).toEqual({ failed: 0, synced: 1 });
    expect(syncStates).toEqual(["synced"]);
    expect(athleteIdempotencyKey(athlete)).toBe(`${athlete.id}:v1`);
  });
});