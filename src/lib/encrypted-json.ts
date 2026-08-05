const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type EncryptedJson = {
  algorithm: "AES-GCM";
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  version: 1;
};

// The key is deliberately non-extractable: IndexedDB can retain the CryptoKey for this device,
// but application code cannot export its raw key material.
export async function createStorageKey() {
  return crypto.subtle.generateKey({ length: 256, name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(value: unknown, key: CryptoKey): Promise<EncryptedJson> {
  return encryptBytes(textEncoder.encode(JSON.stringify(value)).buffer, key);
}

export async function encryptBytes(value: ArrayBuffer, key: CryptoKey): Promise<EncryptedJson> {
  // AES-GCM requires a unique IV for every encryption with the same key; 96 bits is the Web Crypto recommendation.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, key, value);

  return {
    algorithm: "AES-GCM",
    ciphertext,
    iv: iv.buffer,
    version: 1,
  };
}

export async function decryptJson<T>(payload: EncryptedJson, key: CryptoKey): Promise<T> {
  return JSON.parse(textDecoder.decode(await decryptBytes(payload, key))) as T;
}

export async function decryptBytes(payload: EncryptedJson, key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { iv: payload.iv, name: payload.algorithm },
    key,
    payload.ciphertext,
  );
}
