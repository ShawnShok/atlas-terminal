import type {
  CacheReadResult,
  CacheSetOptions,
  CacheStore,
} from "./types";

interface StoredValue<T> {
  readonly value: T;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly staleUntil: number;
}

export interface MemoryCacheOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
}

/** A bounded, process-local LRU cache suitable for development and one instance. */
export class MemoryCacheStore implements CacheStore {
  readonly #entries = new Map<string, StoredValue<unknown>>();
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: MemoryCacheOptions = {}) {
    const maxEntries = options.maxEntries ?? 2_000;

    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError("Memory cache maxEntries must be a positive integer.");
    }

    this.#maxEntries = maxEntries;
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    return this.#entries.size;
  }

  async get<T>(key: string): Promise<CacheReadResult<T>> {
    const entry = this.#entries.get(key) as StoredValue<T> | undefined;

    if (!entry) {
      return { status: "miss" };
    }

    const now = this.#now();
    if (now >= entry.staleUntil) {
      this.#entries.delete(key);
      return { status: "miss" };
    }

    // Refresh insertion order for approximate LRU eviction.
    this.#entries.delete(key);
    this.#entries.set(key, entry);

    return {
      status: now >= entry.expiresAt ? "stale" : "hit",
      value: entry.value,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    };
  }

  async set<T>(
    key: string,
    value: T,
    options: CacheSetOptions,
  ): Promise<void> {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs < 0) {
      throw new RangeError("Cache ttlMs must be a non-negative finite number.");
    }

    const staleTtlMs = options.staleTtlMs ?? 0;
    if (!Number.isFinite(staleTtlMs) || staleTtlMs < 0) {
      throw new RangeError(
        "Cache staleTtlMs must be a non-negative finite number.",
      );
    }

    if (options.ttlMs === 0) {
      this.#entries.delete(key);
      return;
    }

    const now = this.#now();
    const expiresAt = now + options.ttlMs;
    this.#entries.delete(key);
    this.#entries.set(key, {
      value,
      createdAt: now,
      expiresAt,
      staleUntil: expiresAt + staleTtlMs,
    });

    this.#evictOverflow();
  }

  async delete(key: string): Promise<boolean> {
    return this.#entries.delete(key);
  }

  async clear(): Promise<void> {
    this.#entries.clear();
  }

  #evictOverflow(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        return;
      }
      this.#entries.delete(oldestKey);
    }
  }
}
