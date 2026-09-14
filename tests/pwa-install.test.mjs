import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [layout, navRail, installButton, manifestSource, serviceWorker] = await Promise.all([
  readFile(new URL("app/layout.tsx", root), "utf8"),
  readFile(new URL("components/terminal/NavRail.tsx", root), "utf8"),
  readFile(new URL("components/terminal/InstallAppButton.tsx", root), "utf8"),
  readFile(new URL("public/manifest.webmanifest", root), "utf8"),
  readFile(new URL("public/sw.js", root), "utf8"),
]);

const manifest = JSON.parse(manifestSource);

test("ATLAS advertises a standalone installable app with desktop-sized icons", () => {
  assert.equal(manifest.name, "ATLAS Terminal");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /appleWebApp:\s*\{\s*capable:\s*true/);
});

test("the terminal exposes native install prompting and platform fallback instructions", () => {
  assert.match(navRail, /<InstallAppButton collapsed=\{collapsed\}/);
  assert.match(installButton, /beforeinstallprompt/);
  assert.match(installButton, /display-mode:\s*standalone/);
  assert.match(installButton, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(installButton, /File → Add to Dock/);
  assert.match(installButton, /Install ATLAS Terminal/);
});

test("the service worker enables app installation without caching private research responses", () => {
  assert.match(serviceWorker, /addEventListener\("install"/);
  assert.match(serviceWorker, /addEventListener\("activate"/);
  assert.doesNotMatch(serviceWorker, /addEventListener\("fetch"/);
  assert.doesNotMatch(serviceWorker, /caches\./);
});
