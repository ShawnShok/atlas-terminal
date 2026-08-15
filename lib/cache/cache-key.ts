import type { CacheNamespace } from "./types";

type CacheKeyPart = boolean | number | string | null | undefined;

/** Produces a deterministic, human-inspectable key without accepting objects. */
export function createCacheKey(
  namespace: CacheNamespace,
  ...parts: readonly CacheKeyPart[]
): string {
  const encoded = parts.map((part) =>
    encodeURIComponent(part === undefined ? "undefined" : String(part)),
  );
  return ["atlas", "v1", namespace, ...encoded].join(":");
}
