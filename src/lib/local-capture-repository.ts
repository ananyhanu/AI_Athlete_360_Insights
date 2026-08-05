import Dexie, { type Table } from "dexie";
import {
  createStorageKey,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  type EncryptedJson,
} from "./encrypted-json";
import type { StorageKeyProvider } from "./local-athlete-repository";

type CaptureDetails = {
  athleteId: string;
  createdAt: string;
  durationSeconds: number;
  mimeType: string;
  source: "camera" | "upload";
  testId: string;
};

type EncryptedCapture = {
  details: EncryptedJson;
  id: string;
  media: EncryptedJson;
};

type StorageKey = {
  id: string;
  key: CryptoKey;
};

export type CapturedVideo = CaptureDetails & {
  blob: Blob;
  id: string;
};

export type CaptureInput = Omit<CapturedVideo, "createdAt" | "id"> & {
  createdAt?: string;
};

export type LocalCaptureRepositoryOptions = {
  createId?: () => string;
  databaseName?: string;
  keyProvider?: StorageKeyProvider;
  now?: () => Date;
};

export class LocalCaptureRepository {
  private readonly createId: () => string;
  private readonly database: CaptureDatabase;
  private readonly now: () => Date;
  private readonly storageKey: Promise<CryptoKey>;

  constructor(options: LocalCaptureRepositoryOptions = {}) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.database = new CaptureDatabase(options.databaseName ?? "ai-athlete-360-captures");
    this.now = options.now ?? (() => new Date());
    this.storageKey = (
      options.keyProvider ?? new IndexedDbStorageKeyProvider(this.database)
    ).getKey();
  }

  async getById(id: string): Promise<CapturedVideo | null> {
    const stored = await this.database.captures.get(id);
    return stored ? this.decrypt(stored) : null;
  }

  async save(input: CaptureInput): Promise<CapturedVideo> {
    const id = this.createId();
    const details: CaptureDetails = {
      athleteId: input.athleteId,
      createdAt: input.createdAt ?? this.now().toISOString(),
      durationSeconds: input.durationSeconds,
      mimeType: input.mimeType,
      source: input.source,
      testId: input.testId,
    };
    const key = await this.storageKey;
    const stored: EncryptedCapture = {
      details: await encryptJson(details, key),
      id,
      media: await encryptBytes(await input.blob.arrayBuffer(), key),
    };

    await this.database.captures.put(stored);
    return { ...details, blob: input.blob, id };
  }

  close() {
    this.database.close();
  }

  private async decrypt(stored: EncryptedCapture): Promise<CapturedVideo> {
    const key = await this.storageKey;
    const details = await decryptJson<CaptureDetails>(stored.details, key);
    const bytes = await decryptBytes(stored.media, key);

    return {
      ...details,
      blob: new Blob([bytes], { type: details.mimeType }),
      id: stored.id,
    };
  }
}

class CaptureDatabase extends Dexie {
  captures!: Table<EncryptedCapture, string>;
  keys!: Table<StorageKey, string>;

  constructor(databaseName: string) {
    super(databaseName);
    this.version(1).stores({ captures: "&id", keys: "&id" });
  }
}

class IndexedDbStorageKeyProvider implements StorageKeyProvider {
  constructor(private readonly database: CaptureDatabase) {}

  async getKey() {
    const stored = await this.database.keys.get("capture-data-key");
    if (stored) return stored.key;

    const key = await createStorageKey();
    await this.database.keys.put({ id: "capture-data-key", key });
    return key;
  }
}
