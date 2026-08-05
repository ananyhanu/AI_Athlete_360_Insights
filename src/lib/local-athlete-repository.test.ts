import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { AthleteDraft } from "./athlete-domain";
import { createStorageKey } from "./encrypted-json";
import {
  ConsentRequiredError,
  LocalAthleteRepository,
  type StorageKeyProvider,
  VersionConflictError,
} from "./local-athlete-repository";

const databaseNames: string[] = [];

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

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((databaseName) => Dexie.delete(databaseName)));
});

describe("local athlete repository", () => {
  it("persists a consented athlete across repository instances", async () => {
    const databaseName = `ai-athlete-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const keyProvider = createMemoryKeyProvider();
    const repository = new LocalAthleteRepository({
      createId: () => "1f815698-0f04-4a89-a684-e476507ed85c",
      databaseName,
      keyProvider,
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });

    const created = await repository.create(athleteDraft, "athlete-create-001");
    repository.close();

    const reopenedRepository = new LocalAthleteRepository({ databaseName, keyProvider });
    const loaded = await reopenedRepository.getById(created.id);

    expect(created.athleteId).toBe("ATH-2026-1F8156980F04");
    expect(loaded).toEqual(created);
    reopenedRepository.close();
  });

  it("requires consent before creating a durable athlete profile", async () => {
    const databaseName = `ai-athlete-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAthleteRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });

    await expect(
      repository.create({ ...athleteDraft, consentStatus: "pending" }, "athlete-create-002"),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    repository.close();
  });

  it("rejects stale profile updates", async () => {
    const databaseName = `ai-athlete-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const repository = new LocalAthleteRepository({
      databaseName,
      keyProvider: createMemoryKeyProvider(),
    });
    const created = await repository.create(athleteDraft, "athlete-create-003");

    await expect(
      repository.update(
        created.id,
        { changes: { discipline: "200m Sprint" }, version: created.version + 1 },
        "athlete-update-001",
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);
    repository.close();
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
