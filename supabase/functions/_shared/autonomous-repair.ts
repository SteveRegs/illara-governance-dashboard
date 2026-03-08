export const AUTONOMOUS_REPAIR_RULEPACK_VERSION = "tier1-safe-ops-v1" as const;

export const AUTONOMY_TIERS = [0, 1, 2, 3] as const;
export type AutonomyTier = (typeof AUTONOMY_TIERS)[number];

export const REPAIR_RISK_CLASSES = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"] as const;
export type RepairRiskClass = (typeof REPAIR_RISK_CLASSES)[number];

export const REPAIR_APPROVAL_MODES = ["HUMAN", "AUTO"] as const;
export type RepairApprovalMode = (typeof REPAIR_APPROVAL_MODES)[number];

export const REPAIR_ACTOR_TYPES = ["HUMAN", "SYSTEM"] as const;
export type RepairActorType = (typeof REPAIR_ACTOR_TYPES)[number];

export const VERIFICATION_OUTCOMES = [
  "VERIFIED_SUCCESS",
  "VERIFIED_FAILURE",
  "VERIFICATION_INCONCLUSIVE",
  "VERIFICATION_TIMED_OUT",
] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const TIER1_ACTION_TYPES = [
  "CLEAR_EXPIRED_LEASE",
  "RERUN_HARNESS_VERIFICATION",
  "RETRIGGER_RECOMPUTE_FAILURE_WINDOW",
  "REQUEUE_HARNESS_REQUEST",
  "RESET_REQUEST_TO_PENDING",
] as const;
export type Tier1ActionType = (typeof TIER1_ACTION_TYPES)[number];

export const ACTIVE_TIER1_ACTION_TYPES = [
  "CLEAR_EXPIRED_LEASE",
  "RERUN_HARNESS_VERIFICATION",
  "RETRIGGER_RECOMPUTE_FAILURE_WINDOW",
] as const;
export type ActiveTier1ActionType = (typeof ACTIVE_TIER1_ACTION_TYPES)[number];

export const TARGET_KINDS = [
  "harness_run_request",
  "repair_proposal",
  "repair_action_run",
  "failure_window_job",
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const REASON_CODES = [
  "STALE_EXECUTION_LEASE",
  "VERIFICATION_DUE",
  "VERIFICATION_RETRY_AFTER_OPERATIONAL_FAILURE",
  "FAILURE_WINDOW_STALE",
  "REQUEST_REQUEUE_ELIGIBLE",
  "REQUEST_RESET_ELIGIBLE",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const VERIFICATION_PLAN_TYPES = [
  "RERUN_HARNESS_VERIFICATION",
  "STATE_CONFIRMATION_CHECK",
  "DERIVED_STATE_RECOMPUTE_CONFIRMATION",
] as const;
export type VerificationPlanType = (typeof VERIFICATION_PLAN_TYPES)[number];

export const AUTO_APPROVAL_REJECTION_CODES = [
  "UNSTRUCTURED_PROPOSAL",
  "ACTION_TYPE_NOT_ALLOWLISTED",
  "ACTION_TYPE_NOT_ACTIVE",
  "RISK_CLASS_NOT_LOW",
  "AUTONOMY_TIER_INVALID",
  "TARGET_KIND_INVALID",
  "TARGET_ID_INVALID",
  "REASON_CODE_INVALID",
  "MISSING_PRECONDITIONS",
  "MISSING_VERIFICATION_PLAN",
  "PRECONDITION_FAILED",
  "PRECONDITION_NOT_COMPUTABLE",
  "CONFLICTING_ACTIVE_REPAIR",
  "EVIDENCE_STALE",
  "VERIFICATION_PLAN_INVALID",
  "RETRY_BUDGET_EXCEEDED",
  "RATE_LIMIT_EXCEEDED",
  "STATE_CHANGED_DURING_EVALUATION",
  "RULEPACK_MISMATCH",
  "UNKNOWN_FIELD_OR_SCHEMA",
] as const;
export type AutoApprovalRejectionCode =
  (typeof AUTO_APPROVAL_REJECTION_CODES)[number];

export const REPAIR_APPROVAL_EVENT_TYPES = [
  "REPAIR_PROPOSAL_CREATED",
  "AUTO_APPROVAL_EVALUATION_STARTED",
  "AUTO_APPROVAL_ELIGIBLE",
  "AUTO_APPROVAL_REJECTED",
  "AUTO_APPROVED",
  "HUMAN_APPROVED",
  "HUMAN_REJECTED",
  "REPAIR_EXECUTION_STARTED",
  "REPAIR_EXECUTION_COMPLETED",
  "REPAIR_EXECUTION_FAILED",
  "VERIFICATION_STARTED",
  "VERIFICATION_COMPLETED",
  "LEARNING_RECORD_CREATED",
  "LEARNING_RECORD_SKIPPED",
  "ESCALATED_TO_HUMAN",
] as const;
export type RepairApprovalEventType =
  (typeof REPAIR_APPROVAL_EVENT_TYPES)[number];

export type BaseVerificationPlan = {
  type: VerificationPlanType;
  success_condition: string;
  failure_condition?: string | null;
  timeout_seconds?: number | null;
};

export type ReRunHarnessVerificationPlan = BaseVerificationPlan & {
  type: "RERUN_HARNESS_VERIFICATION";
};

export type StateConfirmationCheckPlan = BaseVerificationPlan & {
  type: "STATE_CONFIRMATION_CHECK";
};

export type DerivedStateRecomputeConfirmationPlan = BaseVerificationPlan & {
  type: "DERIVED_STATE_RECOMPUTE_CONFIRMATION";
};

export type VerificationPlan =
  | ReRunHarnessVerificationPlan
  | StateConfirmationCheckPlan
  | DerivedStateRecomputeConfirmationPlan;

export type ClearExpiredLeasePreconditions = {
  status: "EXECUTING";
  lease_expired: boolean;
  run_id_is_null: boolean;
};

export type ReRunHarnessVerificationPreconditions = {
  verification_due: boolean;
  no_active_verification_run: boolean;
  verification_budget_remaining: boolean;
};

export type RetriggerRecomputeFailureWindowPreconditions = {
  recompute_stale_or_failed: boolean;
  no_active_recompute: boolean;
};

export type RequeueHarnessRequestPreconditions = {
  request_requeueable: boolean;
  no_active_lease: boolean;
  no_active_run: boolean;
  retry_budget_remaining: boolean;
};

export type ResetRequestToPendingPreconditions = {
  known_resettable_state: boolean;
  no_active_execution: boolean;
  no_active_run: boolean;
  reset_budget_remaining: boolean;
};

export type PreconditionsByActionType = {
  CLEAR_EXPIRED_LEASE: ClearExpiredLeasePreconditions;
  RERUN_HARNESS_VERIFICATION: ReRunHarnessVerificationPreconditions;
  RETRIGGER_RECOMPUTE_FAILURE_WINDOW: RetriggerRecomputeFailureWindowPreconditions;
  REQUEUE_HARNESS_REQUEST: RequeueHarnessRequestPreconditions;
  RESET_REQUEST_TO_PENDING: ResetRequestToPendingPreconditions;
};

export type ProposalEvidenceBase = {
  observed_at: string;
};

export type ClearExpiredLeaseEvidence = ProposalEvidenceBase & {
  request_id: string;
  lease_expires_at: string;
};

export type RerunHarnessVerificationEvidence = ProposalEvidenceBase & {
  related_entity_id: string;
  prior_verification_status?: string | null;
};

export type RetriggerRecomputeFailureWindowEvidence = ProposalEvidenceBase & {
  recompute_target_id: string;
  last_recompute_at?: string | null;
};

export type RequeueHarnessRequestEvidence = ProposalEvidenceBase & {
  request_id: string;
  last_status_at?: string | null;
};

export type ResetRequestToPendingEvidence = ProposalEvidenceBase & {
  request_id: string;
  last_status_at?: string | null;
};

export type ProposalEvidenceByActionType = {
  CLEAR_EXPIRED_LEASE: ClearExpiredLeaseEvidence;
  RERUN_HARNESS_VERIFICATION: RerunHarnessVerificationEvidence;
  RETRIGGER_RECOMPUTE_FAILURE_WINDOW: RetriggerRecomputeFailureWindowEvidence;
  REQUEUE_HARNESS_REQUEST: RequeueHarnessRequestEvidence;
  RESET_REQUEST_TO_PENDING: ResetRequestToPendingEvidence;
};

export type StructuredRepairIntent<
  TAction extends Tier1ActionType = Tier1ActionType,
> = {
  action_type: TAction;
  target_kind: TargetKind;
  target_id: string;
  reason_code: ReasonCode;
  risk_class: RepairRiskClass;
  autonomy_tier_requested: 1;
  preconditions: PreconditionsByActionType[TAction];
  verification_plan: VerificationPlan;
  proposal_evidence: ProposalEvidenceByActionType[TAction];
};

export type AutonomousRepairProposalRecord = {
  id: string;
  created_at: string;
  action_type: string | null;
  target_kind: string | null;
  target_id: string | null;
  reason_code: string | null;
  risk_class: string | null;
  autonomy_tier_requested: number | null;
  is_structured_intent: boolean;
  preconditions_json: unknown;
  verification_plan_json: unknown;
  proposal_evidence_json: unknown;
  rulepack_version: string | null;
  auto_approval_eligible: boolean | null;
  auto_approval_evaluated_at: string | null;
  auto_approval_rejection_code: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return (
    typeof value === "string" &&
    (allowed as readonly string[]).indexOf(value) !== -1
  );
}

export function isTier1ActionType(value: unknown): value is Tier1ActionType {
  return isOneOf(value, TIER1_ACTION_TYPES);
}

export function isActiveTier1ActionType(
  value: unknown,
): value is ActiveTier1ActionType {
  return isOneOf(value, ACTIVE_TIER1_ACTION_TYPES);
}

export function isTargetKind(value: unknown): value is TargetKind {
  return isOneOf(value, TARGET_KINDS);
}

export function isReasonCode(value: unknown): value is ReasonCode {
  return isOneOf(value, REASON_CODES);
}

export function isRiskClass(value: unknown): value is RepairRiskClass {
  return isOneOf(value, REPAIR_RISK_CLASSES);
}

export function isVerificationPlanType(
  value: unknown,
): value is VerificationPlanType {
  return isOneOf(value, VERIFICATION_PLAN_TYPES);
}

export function isVerificationPlan(value: unknown): value is VerificationPlan {
  if (!isObject(value)) return false;
  if (!isVerificationPlanType(value.type)) return false;
  if (!isString(value.success_condition)) return false;

  if (
    value.failure_condition !== undefined &&
    value.failure_condition !== null &&
    typeof value.failure_condition !== "string"
  ) {
    return false;
  }

  if (
    value.timeout_seconds !== undefined &&
    value.timeout_seconds !== null &&
    typeof value.timeout_seconds !== "number"
  ) {
    return false;
  }

  return true;
}

export function isStructuredRepairIntent(
  value: unknown,
): value is StructuredRepairIntent {
  if (!isObject(value)) return false;
  if (!isTier1ActionType(value.action_type)) return false;
  if (!isTargetKind(value.target_kind)) return false;
  if (!isString(value.target_id)) return false;
  if (!isReasonCode(value.reason_code)) return false;
  if (!isRiskClass(value.risk_class)) return false;
  if (value.autonomy_tier_requested !== 1) return false;
  if (!isObject(value.preconditions)) return false;
  if (!isVerificationPlan(value.verification_plan)) return false;
  if (!isObject(value.proposal_evidence)) return false;
  if (!isString(value.proposal_evidence.observed_at)) return false;

  return true;
}

export function buildStructuredRepairIntentRow(
  intent: StructuredRepairIntent,
) {
  return {
    action_type: intent.action_type,
    target_kind: intent.target_kind,
    target_id: intent.target_id,
    reason_code: intent.reason_code,
    risk_class: intent.risk_class,
    autonomy_tier_requested: intent.autonomy_tier_requested,
    is_structured_intent: true,
    preconditions_json: intent.preconditions,
    verification_plan_json: intent.verification_plan,
    proposal_evidence_json: intent.proposal_evidence,
    rulepack_version: AUTONOMOUS_REPAIR_RULEPACK_VERSION,
  };
}

export function getInitialAutoApprovalRejectionCode(
  proposal: Pick<
    AutonomousRepairProposalRecord,
    | "is_structured_intent"
    | "action_type"
    | "target_kind"
    | "target_id"
    | "reason_code"
    | "risk_class"
    | "autonomy_tier_requested"
    | "verification_plan_json"
    | "preconditions_json"
    | "rulepack_version"
  >,
): AutoApprovalRejectionCode | null {
  if (!proposal.is_structured_intent) return "UNSTRUCTURED_PROPOSAL";
  if (!isTier1ActionType(proposal.action_type)) return "ACTION_TYPE_NOT_ALLOWLISTED";
  if (!isActiveTier1ActionType(proposal.action_type)) return "ACTION_TYPE_NOT_ACTIVE";
  if (!isTargetKind(proposal.target_kind)) return "TARGET_KIND_INVALID";
  if (!isString(proposal.target_id)) return "TARGET_ID_INVALID";
  if (!isReasonCode(proposal.reason_code)) return "REASON_CODE_INVALID";
  if (proposal.risk_class !== "LOW") return "RISK_CLASS_NOT_LOW";
  if (proposal.autonomy_tier_requested !== 1) return "AUTONOMY_TIER_INVALID";
  if (!isObject(proposal.preconditions_json)) return "MISSING_PRECONDITIONS";
  if (!isVerificationPlan(proposal.verification_plan_json)) return "MISSING_VERIFICATION_PLAN";
  if (proposal.rulepack_version !== AUTONOMOUS_REPAIR_RULEPACK_VERSION) {
    return "RULEPACK_MISMATCH";
  }

  return null;
}

export const SYSTEM_AUTO_APPROVER_ACTOR_ID = "autonomous-repair-approver-v1" as const;