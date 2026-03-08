Autonomous Repair v1 Regression Runbook
Status
Active
Purpose
This runbook provides a repeatable validation sequence for the current Autonomous Repair v1 boundary in the Illara Governance Dashboard.
It is designed to verify that the system still correctly supports:
unstructured proposal rejection in shadow mode
structured proposal eligibility in shadow mode
bounded autonomous approval
execution provenance continuity
verification and learning record continuity
This runbook is intentionally operational and copy-paste oriented.
Scope
This runbook covers only the currently live Tier 1 boundary.
Included
RERUN_HARNESS_VERIFICATION
shadow evaluation
autonomous approval
NOOP execution
verification persistence
learning record persistence
Excluded
CLEAR_EXPIRED_LEASE
REQUEUE_HARNESS_REQUEST
RESET_REQUEST_TO_PENDING
destructive repair actions
non-NOOP execution
policy/schema/privilege changes
Preconditions
Before running this sequence, confirm:
local shell environment is loaded from .env.illara.canonical
SUPABASE_URL is set
SUPABASE_ANON_KEY is set
SUPABASE_SERVICE_ROLE_KEY is set
ILLARA_WORKER_TOKEN is set
ILLARA_APPROVER_TOKEN is set
deployed functions are up to date:
harness-run
approve-repair-proposal
execute-repair-proposal
evaluate-autonomous-repair
approve-autonomous-repair
Quick local env check
python3 - <<'PY'
import os
checks = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ILLARA_WORKER_TOKEN",
    "ILLARA_APPROVER_TOKEN",
]
for k in checks:
    v = os.environ.get(k, "")
    print(f"{k}: set={bool(v)} len={len(v)}")
PY
Expected
all values set
SUPABASE_SERVICE_ROLE_KEY should be a JWT-like value
Part A — Unstructured proposal rejection in shadow mode
A1. Create a fresh failing harness run
curl -sS -X POST "$SUPABASE_URL/functions/v1/harness-run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --data '{
    "phase": "harness",
    "target_system": "governance_dashboard",
    "source": "regression-unstructured-seed"
  }'
Record
Capture the returned run_id.
A2. Find the associated proposal
select
  id,
  run_id,
  proposal_status,
  is_structured_intent,
  created_at
from public.repair_proposals
where run_id = 'RUN_ID_FROM_A1'::uuid;
Expected
one row
proposal_status = PROPOSED
is_structured_intent = false
Capture the returned proposal id as:
UNSTRUCTURED_PROPOSAL_ID
A3. Run shadow evaluation
curl -sS -X POST "$SUPABASE_URL/functions/v1/evaluate-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "UNSTRUCTURED_PROPOSAL_ID"
  }'
Expected curl result
ok = true
mode = SHADOW
evaluated_count = 1
eligible = false
rejection_code = UNSTRUCTURED_PROPOSAL
A4. Verify proposal state
select
  id,
  proposal_status,
  is_structured_intent,
  rulepack_version,
  auto_approval_eligible,
  auto_approval_evaluated_at,
  auto_approval_rejection_code
from public.repair_proposals
where id = 'UNSTRUCTURED_PROPOSAL_ID';
Expected
proposal_status = PROPOSED
is_structured_intent = false
rulepack_version = tier1-safe-ops-v1
auto_approval_eligible = false
auto_approval_rejection_code = UNSTRUCTURED_PROPOSAL
A5. Verify event trail
select
  event_type,
  actor_type,
  actor_id,
  eligibility_result,
  rejection_reason_code,
  created_at
from public.repair_approval_events
where repair_proposal_id = 'UNSTRUCTURED_PROPOSAL_ID'
order by created_at asc;
Expected
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_REJECTED
Part B — Structured proposal eligibility in shadow mode
B1. Create a fresh failing harness run
curl -sS -X POST "$SUPABASE_URL/functions/v1/harness-run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --data '{
    "phase": "harness",
    "target_system": "governance_dashboard",
    "source": "regression-structured-seed"
  }'
Record
Capture the returned run_id.
B2. Find the associated proposal
select
  id,
  run_id,
  proposal_status,
  is_structured_intent,
  action_type,
  target_kind,
  target_id,
  reason_code,
  risk_class,
  autonomy_tier_requested,
  rulepack_version
from public.repair_proposals
where run_id = 'RUN_ID_FROM_B1'::uuid;
Capture the proposal id as:
STRUCTURED_PROPOSAL_ID
Expected initially
proposal_status = PROPOSED
is_structured_intent = false
B3. Shape the proposal into a structured Tier 1 candidate
Use a known prior proposal id for the target of verification, or replace with another valid UUID if needed.
update public.repair_proposals
set
  action_type = 'RERUN_HARNESS_VERIFICATION',
  target_kind = 'repair_proposal',
  target_id = 'a9abcd07-426e-4c28-a8b0-523c2c868add'::uuid,
  reason_code = 'VERIFICATION_DUE',
  risk_class = 'LOW',
  autonomy_tier_requested = 1,
  is_structured_intent = true,
  preconditions_json = jsonb_build_object(
    'verification_due', true,
    'no_active_verification_run', true,
    'verification_budget_remaining', true
  ),
  verification_plan_json = jsonb_build_object(
    'type', 'RERUN_HARNESS_VERIFICATION',
    'success_condition', 'harness rerun completes with PASS or FAIL terminal result'
  ),
  proposal_evidence_json = jsonb_build_object(
    'related_entity_id', 'a9abcd07-426e-4c28-a8b0-523c2c868add',
    'prior_verification_status', 'VERIFIED_FAILURE',
    'observed_at', now()::text
  ),
  rulepack_version = 'tier1-safe-ops-v1'
where id = 'STRUCTURED_PROPOSAL_ID'
returning
  id,
  proposal_status,
  is_structured_intent,
  action_type,
  target_kind,
  target_id,
  reason_code,
  risk_class,
  autonomy_tier_requested,
  rulepack_version;
Expected
update succeeds
is_structured_intent = true
action_type = RERUN_HARNESS_VERIFICATION
risk_class = LOW
autonomy_tier_requested = 1
rulepack_version = tier1-safe-ops-v1
B4. Run shadow evaluation
curl -sS -X POST "$SUPABASE_URL/functions/v1/evaluate-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "STRUCTURED_PROPOSAL_ID"
  }'
Expected curl result
ok = true
mode = SHADOW
evaluated_count = 1
eligible = true
rejection_code = null
B5. Verify proposal state
select
  id,
  proposal_status,
  is_structured_intent,
  action_type,
  target_kind,
  target_id,
  reason_code,
  risk_class,
  autonomy_tier_requested,
  rulepack_version,
  auto_approval_eligible,
  auto_approval_evaluated_at,
  auto_approval_rejection_code
from public.repair_proposals
where id = 'STRUCTURED_PROPOSAL_ID';
Expected
proposal_status = PROPOSED
is_structured_intent = true
auto_approval_eligible = true
auto_approval_rejection_code = null
B6. Verify event trail
select
  event_type,
  actor_type,
  actor_id,
  eligibility_result,
  rejection_reason_code,
  created_at
from public.repair_approval_events
where repair_proposal_id = 'STRUCTURED_PROPOSAL_ID'
order by created_at asc;
Expected
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
Part C — Autonomous approval
C1. Approve the eligible structured proposal
curl -sS -X POST "$SUPABASE_URL/functions/v1/approve-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "STRUCTURED_PROPOSAL_ID"
  }'
Expected curl result
ok = true
proposal shows:
proposal_status = APPROVED
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
C2. Verify proposal state
select
  id,
  proposal_status,
  decided_at,
  decided_by,
  decision_reason,
  approval_mode,
  approved_by_actor_type,
  approved_by_actor_id,
  autonomy_tier_used,
  action_type,
  rulepack_version,
  auto_approval_eligible,
  auto_approval_evaluated_at,
  auto_approval_rejection_code
from public.repair_proposals
where id = 'STRUCTURED_PROPOSAL_ID';
Expected
proposal_status = APPROVED
decided_by = autonomous-repair-approver-v1
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
C3. Verify event trail includes autonomous approval
select
  event_type,
  actor_type,
  actor_id,
  eligibility_result,
  rejection_reason_code,
  created_at
from public.repair_approval_events
where repair_proposal_id = 'STRUCTURED_PROPOSAL_ID'
order by created_at asc;
Expected
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVED
Part D — Autonomous execution and provenance continuity
D1. Execute the autonomously approved proposal
curl -sS -X POST "$SUPABASE_URL/functions/v1/execute-repair-proposal" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "STRUCTURED_PROPOSAL_ID",
    "mode": "NOOP",
    "actor_id": "repair-worker"
  }'
Expected curl result
ok = true
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
rulepack_version = tier1-safe-ops-v1
status = EXECUTED_NOOP
Capture:
ACTION_RUN_ID
D2. Verify action run
select
  id,
  proposal_id,
  approval_mode,
  approved_by_actor_type,
  approved_by_actor_id,
  autonomy_tier_used,
  rulepack_version,
  verification_outcome,
  verification_completed_at,
  escalated_to_human,
  requested_at,
  metadata
from public.repair_action_runs
where id = 'ACTION_RUN_ID';
Expected
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
rulepack_version = tier1-safe-ops-v1
D3. Verify approval event trail
select
  event_type,
  actor_type,
  actor_id,
  action_type,
  target_kind,
  target_id,
  autonomy_tier,
  rulepack_version,
  eligibility_result,
  rejection_reason_code,
  created_at
from public.repair_approval_events
where repair_proposal_id = 'STRUCTURED_PROPOSAL_ID'
order by created_at asc;
Expected
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVED
REPAIR_EXECUTION_STARTED
VERIFICATION_COMPLETED
D4. Verify learning record
select
  proposal_id,
  action_run_id,
  action_type,
  target_kind,
  target_id,
  proposal_reason_code,
  verification_outcome,
  escalation_required,
  rulepack_version,
  autonomy_tier_used,
  created_at
from public.learning_records
where action_run_id = 'ACTION_RUN_ID'
order by created_at desc;
Expected
action_type = RERUN_HARNESS_VERIFICATION
proposal_reason_code = VERIFICATION_DUE
verification_outcome populated
rulepack_version = tier1-safe-ops-v1
autonomy_tier_used = 1
Pass criteria
This regression run passes only if all of the following are true:
Unstructured path
shadow evaluation rejects with UNSTRUCTURED_PROPOSAL
proposal row persists rejection
event trail shows rejection sequence
Structured shadow path
structured proposal becomes auto_approval_eligible = true
event trail shows AUTO_APPROVAL_ELIGIBLE
Autonomous approval path
proposal moves to APPROVED
proposal row records AUTO provenance
Execution continuity path
action run preserves AUTO provenance
verification persists
learning record preserves autonomy context
Fail criteria
This regression run fails if any of the following occur:
unstructured proposal is marked eligible
structured proposal is rejected without a valid reason
autonomous approval succeeds for a non-allowlisted action
execution records human provenance for an auto-approved proposal
event trail is missing one of the core lifecycle events
learning record drops rulepack_version or autonomy_tier_used
Current live boundary reminder
This runbook validates only the current live autonomous scope:
action type: RERUN_HARNESS_VERIFICATION
approval tier: 1
execution mode: NOOP
rulepack: tier1-safe-ops-v1
All other actions remain outside the autonomous approval boundary unless explicitly added later.
Operator notes
Prefer inline UUIDs in curl bodies if shell variables have been unreliable.
If a function behaves unexpectedly, inspect both:
function response
repair_approval_events
If proposal updates do not persist, check enforce_repair_proposal_immutability().
If approval provenance looks wrong in execution, inspect execute-repair-proposal before assuming DB corruption.
Final note
This runbook is not just a QA tool.
It is part of the governance surface.
A system that cannot be re-proven cannot be responsibly expanded.