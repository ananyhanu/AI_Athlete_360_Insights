import Dexie, { type Table } from "dexie";
import { athleteDraftSchema, athleteRecordSchema, type AthleteRecord } from "./athlete-domain";
import { decryptJson, encryptJson, createStorageKey, type EncryptedJson } from "./encrypted-json";
import type { AthleteRepository, AthleteUpdate } from "./athlete-repository";

type EncryptedAthlete = {
  id: string;
  payload: EncryptedJson;
};

type StorageKey = {
  id: string;
  key: CryptoKey;
};

export type LocalAthleteRepositoryOptions = {
  createId?: () => string;
  databaseName?: string;
  keyProvider?: StorageKeyProvider;
  now?: () => Date;
};

export interface StorageKeyProvider {
  getKey(): Promise<CryptoKey>;
}

export class ConsentRequiredError extends Error {
  constructor() {
    super("Athlete registration requires privacy consent.");
    this.name = "ConsentRequiredError";
  }
}

export class VersionConflictError extends Error {
  constructor() {
    super("This athlete profile changed elsewhere. Refresh before saving again.");
    this.name = "VersionConflictError";
  }
}

export class LocalAthleteRepository implements AthleteRepository {
  private readonly createId: () => string;
  private readonly database: AthleteDatabase;
  private readonly now: () => Date;
  private readonly storageKey: Promise<CryptoKey>;

  constructor(options: LocalAthleteRepositoryOptions = {}) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.database = new AthleteDatabase(options.databaseName ?? "ai-athlete-360");
    this.now = options.now ?? (() => new Date());
    this.storageKey = (
      options.keyProvider ?? new IndexedDbStorageKeyProvider(this.database)
    ).getKey();
  }

  async create(draft: unknown, _idempotencyKey: string): Promise<AthleteRecord> {
    const parsedDraft = athleteDraftSchema.parse(draft);

    // Do not allocate an identifier or persist an encrypted record before privacy consent is granted.
    if (parsedDraft.consentStatus !== "granted") throw new ConsentRequiredError();

    const id = this.createId();
    const timestamp = this.now().toISOString();
    const athlete = athleteRecordSchema.parse({
      ...parsedDraft,
      athleteId: athleteIdFor(id, this.now()),
      createdAt: timestamp,
      id,
      syncState: "pending",
      updatedAt: timestamp,
      version: 1,
    });

    await this.put(athlete);
    return athlete;
  }

  async getById(id: string): Promise<AthleteRecord | null> {
    const stored = await this.database.athletes.get(id);
    return stored ? this.decrypt(stored) : null;
  }

  async list(): Promise<readonly AthleteRecord[]> {
    const records = await this.database.athletes.toArray();
    const athletes = await Promise.all(records.map((record) => this.decrypt(record)));

    return [...athletes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listUnsynced(): Promise<readonly AthleteRecord[]> {
    return (await this.list()).filter((athlete) => athlete.syncState !== "synced");
  }

  async update(id: string, update: AthleteUpdate, _idempotencyKey: string): Promise<AthleteRecord> {
    return this.database.transaction("rw", this.database.athletes, async () => {
      const stored = await this.database.athletes.get(id);
      if (!stored) throw new VersionConflictError();

      const current = await this.decrypt(stored);
      // The version check provides optimistic concurrency for two tabs or offline sync processes.
      if (current.version !== update.version) throw new VersionConflictError();

      const athlete = athleteRecordSchema.parse({
        ...current,
        ...update.changes,
        syncState: "pending",
        updatedAt: this.now().toISOString(),
        version: current.version + 1,
      });

      await this.put(athlete);
      return athlete;
    });
  }

  async updateSyncState(id: string, syncState: "failed" | "synced"): Promise<AthleteRecord> {
    return this.database.transaction("rw", this.database.athletes, async () => {
      const stored = await this.database.athletes.get(id);
      if (!stored) throw new VersionConflictError();

      const athlete = athleteRecordSchema.parse({
        ...(await this.decrypt(stored)),
        syncState,
      });
      await this.put(athlete);
      return athlete;
    });
  }

  close() {
    this.database.close();
  }

  private async decrypt(stored: EncryptedAthlete) {
    return athleteRecordSchema.parse(await decryptJson(stored.payload, await this.storageKey));
  }

  private async put(athlete: AthleteRecord) {
    const payload = await encryptJson(athlete, await this.storageKey);
    await this.database.athletes.put({ id: athlete.id, payload });
  }
}

class IndexedDbStorageKeyProvider implements StorageKeyProvider {
  constructor(private readonly database: AthleteDatabase) {}

  async getKey() {
    const stored = await this.database.keys.get("athlete-data-key");
    if (stored) return stored.key;

    // Persist the non-extractable CryptoKey itself, never a serialized secret or passphrase.
    const key = await createStorageKey();
    await this.database.keys.put({ id: "athlete-data-key", key });
    return key;
  }
}

class AthleteDatabase extends Dexie {
  athletes!: Table<EncryptedAthlete, string>;
  keys!: Table<StorageKey, string>;

  constructor(databaseName: string) {
    super(databaseName);
    this.version(1).stores({ athletes: "&id", keys: "&id" });
  }
}

function athleteIdFor(id: string, now: Date) {
  return `ATH-${now.getUTCFullYear()}-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
