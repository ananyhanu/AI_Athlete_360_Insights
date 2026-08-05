import { describe, expect, it } from "vitest";
import { athleteDraftSchema, athleteRecordSchema, type AthleteDraft } from "./athlete-domain";

const validAthleteDraft = {
  fullName: "Arjun Sharma",
  dateOfBirth: "2009-03-12",
  gender: "male",
  mobileNumber: "+919820041827",
  emailAddress: "arjun.sharma@example.in",
  guardian: {
    fullName: "Sanjay Sharma",
    relationship: "Parent",
    mobileNumber: "+919876543210",
    emailAddress: "sanjay.sharma@example.in",
  },
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

describe("athlete registration domain", () => {
  it("accepts a complete consented athlete registration", () => {
    const result = athleteDraftSchema.safeParse(validAthleteDraft);

    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe("Arjun Sharma");
    expect(result.data?.consentStatus).toBe("granted");
  });

  it("rejects malformed dates and email addresses", () => {
    const result = athleteDraftSchema.safeParse({
      ...validAthleteDraft,
      dateOfBirth: "12-03-2009",
      emailAddress: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("requires valid immutable record metadata", () => {
    const result = athleteRecordSchema.safeParse({
      ...validAthleteDraft,
      id: "1f815698-0f04-4a89-a684-e476507ed85c",
      athleteId: "ATH-2026-0231",
      version: 1,
      syncState: "pending",
      createdAt: "2026-08-05T10:00:00.000Z",
      updatedAt: "2026-08-05T10:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });
});
