export const SOURCE_LIFECYCLE_STATUSES = [
  "ready",
  "beta",
  "experimental",
  "permission-needed",
  "blocked",
] as const;

export type SourceLifecycleStatus = (typeof SOURCE_LIFECYCLE_STATUSES)[number];

export type SourceLifecycleConfig = {
  lifecycleStatus: SourceLifecycleStatus;
  activationApproved: boolean;
  activationBlockReason?: string;
};

export type SourceActivationDecision = SourceLifecycleConfig & {
  activatable: boolean;
  reasons: string[];
};

const DEFAULT_LIFECYCLE_STATUS: SourceLifecycleStatus = "permission-needed";
const ACTIVATABLE_LIFECYCLE_STATUSES = new Set<SourceLifecycleStatus>([
  "ready",
  "beta",
]);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseLifecycleStatus(value: unknown): SourceLifecycleStatus {
  return typeof value === "string" &&
    (SOURCE_LIFECYCLE_STATUSES as readonly string[]).includes(value)
    ? (value as SourceLifecycleStatus)
    : DEFAULT_LIFECYCLE_STATUS;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function getSourceLifecycleConfig(
  config: unknown,
): SourceLifecycleConfig {
  const object = asObject(config);
  return {
    lifecycleStatus: parseLifecycleStatus(
      object.lifecycleStatus ?? object.lifecycle_status,
    ),
    activationApproved:
      object.activationApproved === true || object.activation_approved === true,
    activationBlockReason: stringValue(
      object.activationBlockReason ?? object.activation_block_reason,
    ),
  };
}

export function getSourceActivationDecision(args: {
  sourceSlug: string;
  config: unknown;
  isRegistered: boolean;
}): SourceActivationDecision {
  const lifecycle = getSourceLifecycleConfig(args.config);
  const reasons: string[] = [];

  if (!args.isRegistered) {
    reasons.push(
      `No connector registered for source slug "${args.sourceSlug}"`,
    );
  }

  if (!ACTIVATABLE_LIFECYCLE_STATUSES.has(lifecycle.lifecycleStatus)) {
    reasons.push(
      lifecycle.activationBlockReason
        ? `Source lifecycle status "${lifecycle.lifecycleStatus}" blocks activation: ${lifecycle.activationBlockReason}`
        : `Source lifecycle status "${lifecycle.lifecycleStatus}" blocks activation`,
    );
  }

  if (!lifecycle.activationApproved) {
    reasons.push(
      `Source activationApproved must be true for lifecycle status "${lifecycle.lifecycleStatus}"`,
    );
  }

  return {
    ...lifecycle,
    activatable: reasons.length === 0,
    reasons,
  };
}
