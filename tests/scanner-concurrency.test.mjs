import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const concurrency = await loadTypeScriptModule(new URL("../lib/scanner/concurrency.ts", import.meta.url));

test("scanner cross-source mapping preserves order and never exceeds its worker bound", async () => {
  let active = 0;
  let maximumActive = 0;
  const result = await concurrency.mapWithConcurrency(
    Array.from({ length: 17 }, (_, index) => index),
    3,
    async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return value * 2;
    },
  );
  assert.equal(maximumActive, 3);
  assert.deepEqual(result, Array.from({ length: 17 }, (_, index) => index * 2));
});

test("scanner cross-source mapping rejects invalid concurrency", async () => {
  await assert.rejects(concurrency.mapWithConcurrency([1], 0, async (value) => value), /positive integer/i);
});
