export type CacheReadResult<T> =
  | { readonly status: "miss" }
  | {
      readonly status: "hit" | "stale";
      readonly value: T;
      readonly createdAt: number;
      readonly expiresAt: number;
    };

export interface CacheSetOptions {
  /** Fresh lifetime in milliseconds. A value of zero removes the key. */
  readonly ttlMs: number;
  /** Additional time an expired value may be used if its provider is down. */
  readonly staleTtlMs?: number;
}

/** Async by design so an in-memory cache can later be replaced by Redis. */
export interface CacheStore {
  get<T>(key: string): Promise<CacheReadResult<T>>;
  set<T>(key: string, value: T, options: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export type CacheNamespace =
  | "quote"
  | "snapshot"
  | "intraday"
  | "option"
  | "news"
  | "event"
  | "reference"
  | "financial"
  | "historical"
  | "generic";

export interface CacheTtlConfig {
  readonly quote: number;
  readonly snapshot: number;
  readonly intraday: number;
  readonly option: number;
  readonly news: number;
  readonly event: number;
  readonly reference: number;
  readonly financial: number;
  readonly historical: number;
  readonly generic: number;
  readonly staleIfError: number;
}
