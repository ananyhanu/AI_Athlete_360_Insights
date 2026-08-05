import { describe, expect, it } from "vitest";
import { createStorageKey, decryptJson, encryptJson } from "./encrypted-json";

describe("encrypted JSON storage", () => {
  it("round-trips values while keeping plaintext out of the ciphertext", async () => {
    const key = await createStorageKey();
    const athlete = { fullName: "Arjun Sharma", mobileNumber: "+919820041827" };

    const encrypted = await encryptJson(athlete, key);
    const decrypted = await decryptJson<typeof athlete>(encrypted, key);

    expect(encrypted.algorithm).toBe("AES-GCM");
    expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain(athlete.fullName);
    expect(decrypted).toEqual(athlete);
  });

  it("does not decrypt data with a different storage key", async () => {
    const encrypted = await encryptJson({ athleteId: "ATH-2026-0231" }, await createStorageKey());

    await expect(decryptJson(encrypted, await createStorageKey())).rejects.toThrow();
  });
});
