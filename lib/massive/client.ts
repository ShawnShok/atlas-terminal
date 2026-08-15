import "server-only";

import { z } from "zod";

import type { CacheReadResult, CacheStore } from "@/lib/cache";
import { MemoryCacheStore } from "@/lib/cache";
import { ProviderError } from "@/lib/errors";

export type MassiveQueryValue =
  | boolean
  | number
  | string
  | readonly (boolean | number | string)[]
  | null
  | undefined;

export interface MassiveRequest<T> {
  readonly path: `/${string}`;
  readonly query?: Readonly<Record<string, MassiveQueryValue>>;
  readonly schema: z.ZodType<T>;
  readonly cacheKey?: string;
  readonly cacheTtlMs?: number;
  readonly staleIfErrorMs?: number;
}

export interface MassiveRequestDiagnostic {
  readonly endpoint: string;
  readonly durationMs: number;
  readonly attempts: number;
  readonly cache: "hit" | "miss" | "deduplicated" | "stale-fallback";
  readonly responseStatus: number | null;
  readonly errorCode: string | null;
}

export interface MassiveClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly cache?: CacheStore;
  readonly fetcher?: typeof fetch;
  readonly maxRetries?: number;
  readonly requestTimeoutMs?: number;
  readonly retryBaseDelayMs?: number;
  readonly onDiagnostic?: (diagnostic: MassiveRequestDiagnostic) => void;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const QUERY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.]*$/;

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRequestId(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "request_id" in payload &&
    typeof payload.request_id === "string"
  ) {
    return payload.request_id;
  }

  return undefined;
}

function statusError(
  response: Response,
  payload: unknown,
  endpoint: string,
): ProviderError {
  const common = {
    provider: "massive",
    endpoint,
    requestId: parseRequestId(payload),
    upstreamStatus: response.status,
    retryable: RETRYABLE_STATUS_CODES.has(response.status),
  } as const;
  switch (response.status) {
    case 401:
      return new ProviderError(
        "UNAUTHORIZED",
        "Massive rejected the server credentials.",
        common,
      );
    case 403:
      return new ProviderError(
        "FORBIDDEN",
        "The current Massive subscription does not allow this request.",
        common,
      );
    case 404:
      return new ProviderError(
        "NOT_FOUND",
        "The requested market data was not found.",
        common,
      );
    case 429:
      return new ProviderError(
        "RATE_LIMITED",
        "Massive rate-limited the request. Try again shortly.",
        common,
      );
    default:
      return new ProviderError(
        "UPSTREAM_UNAVAILABLE",
        response.status >= 500
          ? "Massive is temporarily unavailable."
          : "Massive could not complete the request.",
        common,
      );
  }
}

async function readJson(response: Response, endpoint: string): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ProviderError(
      "UPSTREAM_RESPONSE_INVALID",
      "Massive returned malformed JSON.",
      {
        provider: "massive",
        endpoint,
        upstreamStatus: response.status,
        cause,
      },
    );
  }
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export class MassiveClient {
  readonly #apiKey: string;
  readonly #baseUrl: URL;
  readonly #cache: CacheStore;
  readonly #fetcher: typeof fetch;
  readonly #inFlight = new Map<string, Promise<unknown>>();
  readonly #maxRetries: number;
  readonly #onDiagnostic?: (diagnostic: MassiveRequestDiagnostic) => void;
  readonly #requestTimeoutMs: number;
  readonly #retryBaseDelayMs: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(options: MassiveClientOptions) {
    if (!options.apiKey.trim()) {
      throw new TypeError("MassiveClient requires a non-empty API key.");
    }

    const baseUrl = new URL(options.baseUrl ?? "https://api.massive.com");
    const isLocal = baseUrl.hostname === "localhost" || baseUrl.hostname === "127.0.0.1";
    if (baseUrl.protocol !== "https:" && !isLocal) {
      throw new TypeError("MassiveClient baseUrl must use HTTPS.");
    }

    this.#apiKey = options.apiKey;
    this.#baseUrl = baseUrl;
    this.#cache = options.cache ?? new MemoryCacheStore();
    this.#fetcher = options.fetcher ?? fetch;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.#retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
    this.#onDiagnostic = options.onDiagnostic;
    this.#sleep = options.sleep ?? defaultSleep;

    if (!Number.isInteger(this.#maxRetries) || this.#maxRetries < 0) {
      throw new RangeError("MassiveClient maxRetries must be a non-negative integer.");
    }
  }

  async request<T>(request: MassiveRequest<T>): Promise<T> {
    const startedAt = Date.now();
    const url = this.#buildUrl(request.path, request.query);
    const endpoint = `${url.pathname}${url.search}`;
    const key = request.cacheKey ?? `massive:${endpoint}`;
    let cached: CacheReadResult<T> = { status: "miss" };

    if ((request.cacheTtlMs ?? 0) > 0) {
      try {
        cached = await this.#cache.get<T>(key);
      } catch {
        cached = { status: "miss" };
      }

      if (cached.status === "hit") {
        this.#emitDiagnostic({
          endpoint,
          startedAt,
          attempts: 0,
          cache: "hit",
          responseStatus: null,
          errorCode: null,
        });
        return cached.value;
      }
    }

    const existing = this.#inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      const value = await existing;
      this.#emitDiagnostic({
        endpoint,
        startedAt,
        attempts: 0,
        cache: "deduplicated",
        responseStatus: null,
        errorCode: null,
      });
      return value;
    }

    const pending = this.#execute(request, url, endpoint, cached, startedAt);
    this.#inFlight.set(key, pending);

    try {
      return await pending;
    } finally {
      if (this.#inFlight.get(key) === pending) {
        this.#inFlight.delete(key);
      }
    }
  }

  #buildUrl(
    path: MassiveRequest<unknown>["path"],
    query: MassiveRequest<unknown>["query"],
  ): URL {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      throw new TypeError("Massive request paths must be root-relative URL paths.");
    }

    const url = new URL(path, this.#baseUrl);
    if (url.origin !== this.#baseUrl.origin) {
      throw new TypeError("Massive request path resolved outside the configured API.");
    }

    for (const [key, rawValue] of Object.entries(query ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (
        !QUERY_KEY_PATTERN.test(key) ||
        key.toLowerCase() === "apikey" ||
        key.toLowerCase() === "authorization"
      ) {
        throw new TypeError(`Unsupported Massive query parameter: ${key}`);
      }

      if (rawValue === null || rawValue === undefined) {
        continue;
      }

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        url.searchParams.append(key, String(value));
      }
    }

    return url;
  }

  async #execute<T>(
    request: MassiveRequest<T>,
    url: URL,
    endpoint: string,
    staleEntry: CacheReadResult<T>,
    startedAt: number,
  ): Promise<T> {
    let lastStatus: number | null = null;
    let attempts = 0;

    try {
      for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
        attempts = attempt + 1;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);

        try {
          const response = await this.#fetcher(url, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${this.#apiKey}`,
            },
            cache: "no-store",
            signal: controller.signal,
          });
          lastStatus = response.status;
          const payload = await readJson(response, endpoint);

          if (!response.ok) {
            const error = statusError(response, payload, endpoint);
            if (error.retryable && attempt < this.#maxRetries) {
              const retryAfter = retryAfterMilliseconds(response);
              await this.#waitBeforeRetry(attempt, retryAfter);
              continue;
            }
            throw error;
          }

          const parsed = request.schema.safeParse(payload);
          if (!parsed.success) {
            throw new ProviderError(
              "UPSTREAM_RESPONSE_INVALID",
              "Massive returned data in an unexpected format.",
              {
                provider: "massive",
                endpoint,
                requestId: parseRequestId(payload),
                upstreamStatus: response.status,
                cause: parsed.error,
              },
            );
          }

          if ((request.cacheTtlMs ?? 0) > 0) {
            try {
              await this.#cache.set(
                request.cacheKey ?? `massive:${endpoint}`,
                parsed.data,
                {
                  ttlMs: request.cacheTtlMs ?? 0,
                  staleTtlMs: request.staleIfErrorMs ?? 0,
                },
              );
            } catch {
              // A cache outage must not turn valid market data into an API outage.
            }
          }

          this.#emitDiagnostic({
            endpoint,
            startedAt,
            attempts,
            cache: "miss",
            responseStatus: response.status,
            errorCode: null,
          });
          return parsed.data;
        } catch (error) {
          const providerError =
            error instanceof ProviderError
              ? error
              : new ProviderError(
                  error instanceof Error && error.name === "AbortError"
                    ? "TIMEOUT"
                    : "NETWORK_ERROR",
                  error instanceof Error && error.name === "AbortError"
                    ? "The Massive request timed out."
                    : "The Massive request failed due to a network error.",
                  {
                    provider: "massive",
                    endpoint,
                    retryable: true,
                    cause: error,
                  },
                );

          if (providerError.retryable && attempt < this.#maxRetries) {
            await this.#waitBeforeRetry(attempt, null);
            continue;
          }
          throw providerError;
        } finally {
          clearTimeout(timeout);
        }
      }

      throw new ProviderError(
        "UPSTREAM_UNAVAILABLE",
        "Massive did not complete the request.",
        { provider: "massive", endpoint, retryable: true },
      );
    } catch (error) {
      if (
        staleEntry.status === "stale" &&
        error instanceof ProviderError &&
        error.retryable
      ) {
        this.#emitDiagnostic({
          endpoint,
          startedAt,
          attempts,
          cache: "stale-fallback",
          responseStatus: lastStatus,
          errorCode: error.code,
        });
        return staleEntry.value;
      }

      this.#emitDiagnostic({
        endpoint,
        startedAt,
        attempts,
        cache: "miss",
        responseStatus: lastStatus,
        errorCode: error instanceof ProviderError ? error.code : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async #waitBeforeRetry(
    attempt: number,
    retryAfterMs: number | null,
  ): Promise<void> {
    const exponentialDelay = this.#retryBaseDelayMs * 2 ** attempt;
    const jitter = Math.floor(exponentialDelay * Math.random() * 0.2);
    const delay = Math.min(retryAfterMs ?? exponentialDelay + jitter, 30_000);
    await this.#sleep(delay);
  }

  #emitDiagnostic(input: {
    readonly endpoint: string;
    readonly startedAt: number;
    readonly attempts: number;
    readonly cache: MassiveRequestDiagnostic["cache"];
    readonly responseStatus: number | null;
    readonly errorCode: string | null;
  }): void {
    this.#onDiagnostic?.({
      endpoint: input.endpoint,
      durationMs: Date.now() - input.startedAt,
      attempts: input.attempts,
      cache: input.cache,
      responseStatus: input.responseStatus,
      errorCode: input.errorCode,
    });
  }
}
