export type AlertDeliveryDecisionReason =
  | "triggered"
  | "disabled"
  | "not-matched"
  | "duplicate"
  | "cooldown";

export interface AlertDeliveryInput {
  readonly enabled: boolean;
  readonly matched: boolean;
  /** Stable article, event, or market-observation key. */
  readonly eventKey: string;
  readonly lastDeliveryKey?: string | null;
  readonly lastTriggeredAt?: string | null;
  readonly cooldownSeconds?: number | null;
  readonly observedAt: string;
}

export interface AlertDeliveryDecision {
  readonly shouldNotify: boolean;
  readonly reason: AlertDeliveryDecisionReason;
  readonly deliveryKey: string | null;
  readonly evaluatedAt: string;
  readonly nextEligibleAt: string | null;
}

function validTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${field} must be a valid timestamp.`);
  return timestamp;
}

/**
 * Central, deterministic notification gate. Matching remains alert-type-specific;
 * duplicate suppression and cooldown behavior are shared by every alert type.
 */
export function evaluateAlertDelivery(
  input: AlertDeliveryInput,
): AlertDeliveryDecision {
  const observedAt = validTimestamp(input.observedAt, "observedAt");
  const cooldownSeconds = input.cooldownSeconds ?? 0;
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0) {
    throw new RangeError("cooldownSeconds must be a non-negative finite number.");
  }
  const eventKey = input.eventKey.trim();
  if (!eventKey) throw new TypeError("eventKey must not be empty.");

  const base = {
    evaluatedAt: new Date(observedAt).toISOString(),
    deliveryKey: null,
    nextEligibleAt: null,
  } as const;
  if (!input.enabled) return { ...base, shouldNotify: false, reason: "disabled" };
  if (!input.matched) return { ...base, shouldNotify: false, reason: "not-matched" };
  if (input.lastDeliveryKey === eventKey) {
    return { ...base, shouldNotify: false, reason: "duplicate" };
  }

  if (input.lastTriggeredAt && cooldownSeconds > 0) {
    const lastTriggeredAt = validTimestamp(input.lastTriggeredAt, "lastTriggeredAt");
    const nextEligibleAt = lastTriggeredAt + cooldownSeconds * 1_000;
    if (observedAt < nextEligibleAt) {
      return {
        ...base,
        shouldNotify: false,
        reason: "cooldown",
        nextEligibleAt: new Date(nextEligibleAt).toISOString(),
      };
    }
  }

  return {
    shouldNotify: true,
    reason: "triggered",
    deliveryKey: eventKey,
    evaluatedAt: new Date(observedAt).toISOString(),
    nextEligibleAt: cooldownSeconds > 0
      ? new Date(observedAt + cooldownSeconds * 1_000).toISOString()
      : null,
  };
}
