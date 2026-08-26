import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [schema, migration, personalRoute] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260817000000_stage1_persistence_expansion/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../app/api/personal/route.ts", import.meta.url), "utf8"),
]);

function model(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Expected Prisma model ${name}`);
  return match[1];
}

test("Stage 1 persistence models and ownership fields remain explicit", () => {
  for (const name of [
    "ScannerCondition",
    "ScannerRun",
    "ScannerResult",
    "ReadNewsArticle",
    "CachedEvent",
    "CachedNewsMetadata",
  ]) {
    model(name);
    assert.match(migration, new RegExp(`CREATE TABLE "${name}"`));
  }

  for (const name of ["Watchlist", "SavedScanner", "Alert", "SavedWorkspace", "Notes"]) {
    const ownerLine = model(name).match(/^\s*ownerId\s+.*$/m)?.[0] ?? "";
    assert.match(ownerLine, /ownerId\s+String/);
    assert.doesNotMatch(ownerLine, /@default\("primary"\)/);
    assert.match(migration, new RegExp(`ALTER TABLE "${name}" ALTER COLUMN "ownerId" DROP DEFAULT`));
  }
});

test("alert scheduling, delivery, and query indexes are additive", () => {
  const alert = model("Alert");
  assert.match(alert, /cooldownMinutes\s+Int\s+@default\(0\)/);
  assert.match(alert, /deliveryChannels\s+String\[\]\s+@default\(\[\]\)/);
  assert.match(alert, /nextEvaluationAt\s+DateTime\?/);
  assert.match(alert, /lastDeliveryKey\s+String\?/);
  assert.match(alert, /watchlist\s+Watchlist\?\s+@relation\(fields: \[watchlistId, ownerId\]/);
  assert.match(alert, /@@index\(\[enabled, type, nextEvaluationAt\]\)/);
  assert.match(model("Watchlist"), /@@unique\(\[id, ownerId\]\)/);
  assert.match(model("Notes"), /@@index\(\[ownerId, symbol, updatedAt\]\)/);
  assert.match(model("CachedEvent"), /dedupeKey\s+String\s+@unique/);
  assert.match(model("CachedNewsMetadata"), /dedupeKey\s+String\s+@unique/);
  assert.match(schema, /enum AlertType \{[\s\S]*?OPTIONS[\s\S]*?\}/);
  assert.match(migration, /ALTER TYPE "AlertType" ADD VALUE 'OPTIONS'/);
  assert.match(migration, /"symbols" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/);
  assert.match(migration, /"categories" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\]/);
  assert.match(migration, /CREATE UNIQUE INDEX "CachedEvent_dedupeKey_key"/);
  assert.match(migration, /CREATE UNIQUE INDEX "CachedNewsMetadata_dedupeKey_key"/);
});

test("default personal references are checked against the authenticated owner", () => {
  assert.match(personalRoute, /assertOwnedSettingsReferences/);
  assert.match(personalRoute, /where:\s*\{ id: input\.defaultWatchlistId, ownerId \}/);
  assert.match(personalRoute, /where:\s*\{ id: input\.defaultWorkspaceId, ownerId \}/);
  assert.match(personalRoute, /await assertOwnedSettingsReferences\(db, ownerId, input\)/);
});

test("durable watchlist updates validate unique symbols and preserve owner boundaries", () => {
  assert.match(personalRoute, /const watchlistSymbolsSchema = z\.array\(tickerSchema\)\.max\(100\)\.superRefine/);
  assert.match(personalRoute, /each watchlist symbol must be unique/);
  assert.match(personalRoute, /const watchlistPatchSchema = z\.object/);
  assert.match(personalRoute, /At least one watchlist field must be supplied/);
  assert.match(personalRoute, /const ownedWatchlist = await transaction\.watchlist\.findFirst\(\{\s*where: \{ id, ownerId \}/);
  assert.match(personalRoute, /throw new AppError\("NOT_FOUND", "The selected watchlist is not available to this account\."\)/);
  assert.match(personalRoute, /transaction\.watchlistTicker\.deleteMany/);
  assert.match(personalRoute, /where: \{ watchlistId_symbol: \{ watchlistId: id, symbol \} \}/);
  assert.match(personalRoute, /where: \{ id_ownerId: \{ id, ownerId \} \}/);
  assert.match(personalRoute, /include: \{ tickers: \{ orderBy: \{ position: "asc" \} \} \}/);
});
