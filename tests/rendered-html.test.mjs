import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://atlas.local/", {
      headers: {
        accept: "text/html",
        "x-forwarded-host": "atlas.local",
        "x-forwarded-proto": "https",
      },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the ATLAS Phase 1 terminal shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ATLAS Terminal — Private Financial Research<\/title>/i);
  assert.match(html, /ATLAS/);
  assert.match(html, /MOCK MODE/);
  assert.match(html, /Security workspace foundation/);
  assert.match(html, /SYNC TICKER/);
  assert.match(html, /\/og\.png/);
  assert.match(html, /https:\/\/atlas\.local\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
  assert.doesNotMatch(html, /postgresql:\/\//i);
});

test("starter preview is removed and production metadata is present", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  assert.match(page, /TerminalShell/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /robots:\s*\{ index: false, follow: false \}/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter|react-loading-skeleton|drizzle/);
});
