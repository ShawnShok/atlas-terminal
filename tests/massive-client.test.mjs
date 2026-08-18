import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [clientFile, cacheFile] = await Promise.all([
  readFile(new URL("../lib/massive/client.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/cache/memory-cache.ts", import.meta.url), "utf8"),
]);
const clientSource = clientFile.slice(clientFile.indexOf("export type MassiveQueryValue"));
const cacheSource = cacheFile.slice(cacheFile.indexOf("interface StoredValue"));
const providerErrorStub = `
class ProviderError extends Error {
  constructor(code, message, options) {
    super(message, { cause: options.cause });
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.endpoint = options.endpoint;
    this.provider = options.provider;
    this.requestId = options.requestId;
    this.statusCode = options.statusCode ?? 500;
    this.upstreamStatus = options.upstreamStatus;
  }
}
`;
const transpiled = ts.transpileModule(`${cacheSource}\n${providerErrorStub}\n${clientSource}`, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
  fileName: "massive-client.composite.ts",
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, []);
const { MassiveClient, MemoryCacheStore } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

const schema = {
  safeParse(value) {
    return { success: true, data: value };
  },
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

test("Massive client authenticates with a Bearer header and never puts the key in the URL", async () => {
  const calls = [];
  const client = new MassiveClient({
    apiKey: "unit-test-secret",
    maxRetries: 0,
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ results: [1] });
    },
  });
  const result = await client.request({
    path: "/v1/test",
    query: { zeta: 2, alpha: "one" },
    schema,
  });

  assert.deepEqual(result, { results: [1] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, "Bearer unit-test-secret");
  assert.equal(new URL(calls[0].url).search, "?alpha=one&zeta=2");
  assert.doesNotMatch(calls[0].url, /unit-test-secret/);
});

test("Massive client coalesces simultaneous identical requests", async () => {
  let callCount = 0;
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const client = new MassiveClient({
    apiKey: "unit-test-secret",
    maxRetries: 0,
    fetcher: async () => {
      callCount += 1;
      return response;
    },
  });

  const first = client.request({ path: "/v1/shared", schema });
  const second = client.request({ path: "/v1/shared", schema });
  release(jsonResponse({ shared: true }));
  assert.deepEqual(await Promise.all([first, second]), [{ shared: true }, { shared: true }]);
  assert.equal(callCount, 1);
});

test("Massive client honors Retry-After within a bounded retry count", async () => {
  const sleeps = [];
  let callCount = 0;
  const client = new MassiveClient({
    apiKey: "unit-test-secret",
    maxRetries: 1,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    fetcher: async () => {
      callCount += 1;
      return callCount === 1
        ? jsonResponse({ error: "limited" }, { status: 429, headers: { "retry-after": "2" } })
        : jsonResponse({ recovered: true });
    },
  });

  assert.deepEqual(await client.request({ path: "/v1/retry", schema }), { recovered: true });
  assert.equal(callCount, 2);
  assert.deepEqual(sleeps, [2_000]);
});

test("Massive client serves stale data only for retryable provider failures", async () => {
  let now = 0;
  const cache = new MemoryCacheStore({ now: () => now });
  await cache.set("stale", { cached: true }, { ttlMs: 10, staleTtlMs: 100 });
  now = 11;
  const retryable = new MassiveClient({
    apiKey: "unit-test-secret",
    cache,
    maxRetries: 0,
    fetcher: async () => jsonResponse({ error: "down" }, { status: 503 }),
  });
  assert.deepEqual(await retryable.request({
    path: "/v1/stale",
    schema,
    cacheKey: "stale",
    cacheTtlMs: 10,
    staleIfErrorMs: 100,
  }), { cached: true });

  await cache.set("credential", { cached: true }, { ttlMs: 10, staleTtlMs: 100 });
  now = 22;
  const credentialFailure = new MassiveClient({
    apiKey: "unit-test-secret",
    cache,
    maxRetries: 0,
    fetcher: async () => jsonResponse({ error: "bad key" }, { status: 401 }),
  });
  await assert.rejects(
    credentialFailure.request({
      path: "/v1/credential",
      schema,
      cacheKey: "credential",
      cacheTtlMs: 10,
      staleIfErrorMs: 100,
    }),
    (error) => error.code === "INVALID_API_KEY" && error.retryable === false,
  );
});

test("Massive client rejects unsafe paths and credential-like query parameters", async () => {
  const client = new MassiveClient({
    apiKey: "unit-test-secret",
    maxRetries: 0,
    fetcher: async () => jsonResponse({}),
  });
  await assert.rejects(
    client.request({ path: "//outside.example/data", schema }),
    /root-relative/,
  );
  await assert.rejects(
    client.request({ path: "/v1/test", query: { apiKey: "forbidden" }, schema }),
    /Unsupported Massive query parameter/,
  );
});
