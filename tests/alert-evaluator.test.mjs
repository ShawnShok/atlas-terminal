import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const { evaluateAlertDelivery } = await loadTypeScriptModule(
  new URL("../lib/alerts/evaluator.ts", import.meta.url),
);

const base = {
  enabled: true,
  matched: true,
  eventKey: "article:benzinga-42",
  observedAt: "2026-08-17T16:00:00.000Z",
};

test("central alert gate handles disabled, unmatched, and duplicate alerts", () => {
  assert.equal(evaluateAlertDelivery({ ...base, enabled: false }).reason, "disabled");
  assert.equal(evaluateAlertDelivery({ ...base, matched: false }).reason, "not-matched");
  assert.equal(evaluateAlertDelivery({ ...base, lastDeliveryKey: base.eventKey }).reason, "duplicate");
});

test("alert cooldown blocks until the exact boundary", () => {
  const coolingDown = evaluateAlertDelivery({
    ...base,
    cooldownSeconds: 300,
    lastTriggeredAt: "2026-08-17T15:56:00.000Z",
  });
  assert.equal(coolingDown.shouldNotify, false);
  assert.equal(coolingDown.reason, "cooldown");
  assert.equal(coolingDown.nextEligibleAt, "2026-08-17T16:01:00.000Z");

  const atBoundary = evaluateAlertDelivery({
    ...base,
    cooldownSeconds: 300,
    lastTriggeredAt: "2026-08-17T15:55:00.000Z",
  });
  assert.equal(atBoundary.shouldNotify, true);
  assert.equal(atBoundary.reason, "triggered");
  assert.equal(atBoundary.deliveryKey, base.eventKey);
  assert.equal(atBoundary.nextEligibleAt, "2026-08-17T16:05:00.000Z");
});

test("alert gate rejects invalid timing and empty delivery keys", () => {
  assert.throws(() => evaluateAlertDelivery({ ...base, cooldownSeconds: -1 }), RangeError);
  assert.throws(() => evaluateAlertDelivery({ ...base, eventKey: " " }), TypeError);
  assert.throws(() => evaluateAlertDelivery({ ...base, observedAt: "invalid" }), TypeError);
});
