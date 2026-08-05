import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageKey } from "./encrypted-json";
import { LocalCaptureRepository } from "./local-capture-repository";
import type { StorageKeyProvider } from "./local-athlete-repository";

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((databaseName) => Dexie.delete(databaseName)));
});

describe("local capture repository", () => {
  it("persists an encrypted video capture across repository instances", async () => {
    const databaseName = `ai-athlete-capture-test-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    const keyProvider = createMemoryKeyProvider();
    const repository = new LocalCaptureRepository({
      createId: () => "249d7342-c6b9-4339-a3c7-3bc827d0a3a5",
      databaseName,
      keyProvider,
      now: () => new Date("2026-08-05T10:00:00.000Z"),
    });
    const video = new Blob(["captured-test-video"], { type: "video/webm" });

    const saved = await repository.save({
      athleteId: "athlete-001",
      blob: video,
      durationSeconds: 12,
      mimeType: video.type,
      source: "camera",
      testId: "sit-ups",
    });
    repository.close();

    const reopenedRepository = new LocalCaptureRepository({ databaseName, keyProvider });
    const loaded = await reopenedRepository.getById(saved.id);

    expect(loaded?.athleteId).toBe("athlete-001");
    expect(loaded?.source).toBe("camera");
    await expect(loaded?.blob.text()).resolves.toBe("captured-test-video");
    reopenedRepository.close();
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
