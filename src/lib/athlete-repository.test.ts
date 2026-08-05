import { describe, expect, it } from "vitest";
import { ApiClient, ApiError } from "./api-client";
import { type AthleteDraft, type AthleteRecord } from "./athlete-domain";
import { HttpAthleteRepository } from "./athlete-repository";

const athleteDraft = {
  fullName: "Arjun Sharma",
  dateOfBirth: "2009-03-12",
  gender: "male",
  mobileNumber: "+919820041827",
  emailAddress: "arjun.sharma@example.in",
  guardian: null,
  emergencyContact: {
    fullName: "Sanjay Sharma",
    relationship: "Parent",
    mobileNumber: "+919876543210",
    emailAddress: "sanjay.sharma@example.in",
  },
  address: {
    line1: "12 Shivaji Nagar",
    line2: null,
    villageOrCity: "Pune",
    district: "Pune",
    state: "Maharashtra",
    postalCode: "411005",
  },
  institutionName: "Shivaji Sports Academy",
  sport: "Athletics",
  discipline: "100m Sprint",
  ageCategory: "Under 18",
  heightCm: 172,
  weightKg: 61,
  consentStatus: "granted",
} satisfies AthleteDraft;

const athleteRecord = {
  ...athleteDraft,
  id: "1f815698-0f04-4a89-a684-e476507ed85c",
  athleteId: "ATH-2026-0231",
  version: 1,
  syncState: "pending",
  createdAt: "2026-08-05T10:00:00.000Z",
  updatedAt: "2026-08-05T10:00:00.000Z",
} satisfies AthleteRecord;

describe("HTTP athlete repository", () => {
  it("sends authenticated, traceable, idempotent create requests", async () => {
    let request: Request | undefined;
    const apiClient = new ApiClient({
      baseUrl: "https://api.example.in",
      createCorrelationId: () => "correlation-001",
      fetchFn: async (input, init) => {
        request = new Request(input, init);
        return Response.json(athleteRecord, { status: 201 });
      },
      getAccessToken: () => "access-token",
    });
    const repository = new HttpAthleteRepository(apiClient);

    const athlete = await repository.create(athleteDraft, "athlete-create-001");

    expect(athlete.id).toBe(athleteRecord.id);
    expect(request?.url).toBe("https://api.example.in/v1/athletes");
    expect(request?.headers.get("Authorization")).toBe("Bearer access-token");
    expect(request?.headers.get("Idempotency-Key")).toBe("athlete-create-001");
    expect(request?.headers.get("X-Correlation-ID")).toBe("correlation-001");
    await expect(request?.json()).resolves.toMatchObject({ fullName: athleteDraft.fullName });
  });

  it("converts structured API errors into typed errors", async () => {
    const apiClient = new ApiClient({
      baseUrl: "https://api.example.in",
      createCorrelationId: () => "correlation-002",
      fetchFn: async () =>
        Response.json(
          {
            code: "athlete_duplicate",
            message: "An athlete already exists with this mobile number.",
          },
          { status: 409 },
        ),
    });
    const repository = new HttpAthleteRepository(apiClient);

    await expect(repository.create(athleteDraft, "athlete-create-002")).rejects.toEqual(
      expect.objectContaining({
        code: "athlete_duplicate",
        correlationId: "correlation-002",
        status: 409,
      }),
    );
  });

  it("sends local athlete replicas with a server-acknowledged sync state", async () => {
    let request: Request | undefined;
    const apiClient = new ApiClient({
      baseUrl: "https://api.example.in",
      fetchFn: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ ...athleteRecord, syncState: "synced" }, { status: 201 });
      },
      getAccessToken: () => "access-token",
    });
    const repository = new HttpAthleteRepository(apiClient);

    await repository.upsert(athleteRecord, "athlete-sync-001");

    expect(request?.url).toBe(`https://api.example.in/v1/athletes/${athleteRecord.id}/sync`);
    expect(request?.headers.get("Idempotency-Key")).toBe("athlete-sync-001");
    await expect(request?.json()).resolves.toMatchObject({ syncState: "synced" });
  });
});
