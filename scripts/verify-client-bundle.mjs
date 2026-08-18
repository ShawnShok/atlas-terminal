import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const clientRoot = new URL("../dist/client/", import.meta.url);
const forbidden = [
  /MASSIVE_API_KEY/,
  /api\.massive\.com/i,
  /Authorization\s*[:=]\s*[`'"]Bearer/i,
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = new URL(entry.name, directory.href.endsWith("/") ? directory : new URL(`${directory.href}/`));
    return entry.isDirectory() ? files(new URL(`${target.href}/`)) : [target];
  }))).flat();
}

const assets = await files(clientRoot);
assert.ok(assets.length > 0, "Expected a production client bundle in dist/client.");
for (const asset of assets) {
  if (!/\.(?:css|html|js|json|map|txt)$/i.test(asset.pathname)) continue;
  const source = await readFile(asset, "utf8");
  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, `Server credential material found in ${asset.pathname}`);
  }
}

console.log(`Verified ${assets.length} client assets: no Massive credential material found.`);
