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
Part E — Rate-limit proofs

E1. Cooldown denial proof
Objective
Prove that a valid structured Tier 1 proposal can be denied for cooldown reasons even when it remains otherwise eligible for autonomous approval.

Method
Use the same canonical target as the structured approval path and submit a fresh valid structured proposal within the active cooldown window after a prior AUTO_APPROVED event.

Canonical target
a9abcd07-426e-4c28-a8b0-523c2c868add

Expected approval response
error = cooldown active

Expected event trail
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVAL_RATE_LIMITED

Expected critical event fields
eligibility_result = RATE_LIMITED
rejection_reason_code = AUTO_APPROVAL_COOLDOWN_ACTIVE

Interpretation
This proves cooldown denial is distinct from approval-time recheck failure and can block an otherwise structurally valid proposal.

E2. Budget denial proof
Objective
Prove that approve-autonomous-repair denies an otherwise valid Tier 1 autonomous approval attempt when the per-target 24-hour approval budget has already been exhausted, and that the denial is specifically attributable to budget rather than cooldown or approval-time recheck.

Proof strategy
Because cooldown is evaluated before budget, a pure budget denial cannot be proven by rapid repeated attempts alone.
The proof requires a two-stage sequence:
1. Bring the target to exactly 3 AUTO_APPROVED events inside the 24-hour window.
2. Wait until cooldown has expired.
3. Submit a fresh valid structured Tier 1 proposal for the same target.
4. Confirm denial occurs with:
   AUTO_APPROVAL_RATE_LIMITED
   AUTO_APPROVAL_BUDGET_EXCEEDED

Stage A — Reach budget ceiling
A valid structured Tier 1 proposal was created and successfully auto-approved for the canonical target, bringing the rolling 24-hour approval count to 3.

Expected event trail
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVED

Stage B — Pure budget denial
After cooldown expiration, a fresh valid structured Tier 1 proposal was submitted for the same target.

Tested proposal id
467ce838-5b9f-4a65-8a93-c845c830f618

Observed approval response
{"error":"Autonomous approval budget exceeded","budget_window_hours":24,"budget_max_per_target":3,"approvals_in_window":3}

Observed event trail
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVAL_RATE_LIMITED

Observed critical event fields
eligibility_result = RATE_LIMITED
rejection_reason_code = AUTO_APPROVAL_BUDGET_EXCEEDED

Interpretation
This proves:
budget enforcement is live and functioning
a proposal may remain structurally valid and shadow-eligible yet still be denied for rate-limit reasons
cooldown and budget are distinct denial modes
once cooldown is no longer dominant, budget denial triggers correctly and emits the expected event/audit trail

Operator note
When testing budget behavior in the future:
first verify rolling 24-hour AUTO_APPROVED count
then verify cooldown expiration
only then attempt the next proof run
Otherwise cooldown may mask budget behavior.
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
Rate-limit path
cooldown denial emits AUTO_APPROVAL_RATE_LIMITED with AUTO_APPROVAL_COOLDOWN_ACTIVE
budget denial emits AUTO_APPROVAL_RATE_LIMITED with AUTO_APPROVAL_BUDGET_EXCEEDED
Fail criteria
This regression run fails if any of the following occur:
unstructured proposal is marked eligible
structured proposal is rejected without a valid reason
autonomous approval succeeds for a non-allowlisted action
execution records human provenance for an auto-approved proposal
event trail is missing one of the core lifecycle events
learning record drops rulepack_version or autonomy_tier_used
budget-denial proof attempt is blocked by cooldown when the test intends to isolate budget behavior
rate-limited denial occurs without the expected rejection_reason_code
Current live boundary reminder
This runbook validates only the current live autonomous scope:
action type: RERUN_HARNESS_VERIFICATION
approval tier: 1
execution mode: NOOP
rulepack: tier1-safe-ops-v1
All other actions remain outside the autonomous approval boundary unless explicitly added later.
# Part F — Bounded CLEAR_EXPIRED_LEASE proof (non-live)
## Purpose
This is a bounded non-live proof for the next `CLEAR_EXPIRED_LEASE` implementation checkpoint.
It does not expand the live autonomous boundary.
`CLEAR_EXPIRED_LEASE` is now mutation-proven in bounded synthetic conditions, but it is not broad live autonomous mutation scope.
Post-proof operating posture must be reset to `NOOP` unless intentionally changed for bounded testing.

## Deploy order
```bash
supabase functions deploy propose-clear-expired-lease --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy evaluate-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy approve-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
```

## Call order
1. propose
```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/propose-clear-expired-lease" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{}'
```

2. evaluate
```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/evaluate-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "CLEAR_EXPIRED_LEASE_PROPOSAL_ID"
  }'
```

3. approve
```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/approve-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "CLEAR_EXPIRED_LEASE_PROPOSAL_ID"
  }'
```

## Expected outcomes
- created proposal
  propose-clear-expired-lease creates or surfaces a new structured `CLEAR_EXPIRED_LEASE` proposal id for evaluate and approve.
- active proposal already exists
  propose-clear-expired-lease does not create a duplicate; reuse the existing active proposal id.
- no stale candidate
  propose-clear-expired-lease reports that no eligible stale lease target exists; stop the proof cleanly.
- approval NOOP success
  approval returns bounded NOOP success for `CLEAR_EXPIRED_LEASE` without stale-clear mutation.
- approval recheck failure
  approval fails closed at approval-time recheck, emits the recheck-failure path, and does not approve the proposal.

## Proven bounded remote sequence
Observed sequence
- the initial remote call to `propose-clear-expired-lease` returned `NO_STALE_CANDIDATE`
- SQL confirmed there was no natural remote stale candidate at that moment
- after that bounded proof stop, a controlled synthetic stale candidate was created and used for proof
- `propose-clear-expired-lease` created a valid structured `CLEAR_EXPIRED_LEASE` proposal
- `evaluate-autonomous-repair` marked it eligible in shadow mode
- `approve-autonomous-repair` returned bounded NOOP success

Observed SQL verification
- the proposal remained `PROPOSED` while eligible
- approval provenance was not written to the proposal row in this NOOP path
- the target `repair_action_runs` row remained unchanged
- no stale-clear mutation occurred

Observed cleanup result
- cleanup completed successfully
- synthetic proof artifacts were removed after verification

## NOOP regression preservation note
After future mutation-path edits, rerun the bounded `CLEAR_EXPIRED_LEASE` NOOP regression proof before treating the mutation work as safe.
The NOOP path must remain proven, because bounded mutation support does not replace the requirement to preserve the existing non-mutation approval behavior.

## Part F1 — Stage 1 bounded NOOP regression proof
Purpose
Re-prove that the bounded `CLEAR_EXPIRED_LEASE` NOOP path still behaves exactly as before after mutation-path edits.

Preconditions
- `CLEAR_EXPIRED_LEASE_MODE` is `NOOP`
- remote functions are up to date
- a controlled synthetic stale candidate can be created and later cleaned up

Sequence
1. create a controlled synthetic stale candidate
2. run `propose-clear-expired-lease`
3. run `evaluate-autonomous-repair`
4. run `approve-autonomous-repair`

Expected function results
- proposer creates a valid structured `CLEAR_EXPIRED_LEASE` proposal
- evaluator returns eligible in `SHADOW` mode
- approver returns:
  - `ok: true`
  - `noop: true`
  - message confirming Slice 1 detection and Slice 2 approval-time recheck passed

Required SQL verification
- target `repair_action_runs` row remains unchanged
- proposal remains `PROPOSED`
- no approval provenance is written to the proposal row
- no stale-clear metadata is written

Cleanup
- remove synthetic proof artifacts after verification

## Part F2 — Stage 2 bounded synthetic MUTATE proof
Purpose
Prove the bounded synthetic mutation path for `CLEAR_EXPIRED_LEASE` without documenting it as broad live autonomous mutation scope.

Preconditions
- remote functions are up to date
- `CLEAR_EXPIRED_LEASE_MODE` is temporarily set to `MUTATE`
- a fresh controlled synthetic stale candidate can be created and later cleaned up
- operator is prepared to reset `CLEAR_EXPIRED_LEASE_MODE` back to `NOOP` immediately after proof

Synthetic stale candidate requirements
- `approval_status = APPROVED`
- `execution_status = NOT_STARTED`
- `verification_status = NOT_VERIFIED`
- `escalated_to_human = false` or null
- `requested_at` older than the stale window
- `executed_at` is null
- `verified_at` is null
- `verification_completed_at` is null
- `stale_clear = false`
- `terminal_reason` is not `LEASE_EXPIRED_CLEAR`

Sequence
1. create a fresh controlled synthetic stale candidate
2. run `propose-clear-expired-lease`
3. run `evaluate-autonomous-repair`
4. run `approve-autonomous-repair`

Expected function results
- proposer creates a valid structured `CLEAR_EXPIRED_LEASE` proposal
- evaluator returns eligible in `SHADOW` mode
- approver returns:
  - `ok: true`
  - `approved: true`
  - `autonomous: true`
  - `noop: false`
  - `mode: MUTATE`
  - `mutated: true`
  - `verified: true`

Required mutation-state verification
- target `repair_action_runs` row is terminalized to:
  - `approval_status = SKIPPED`
  - `execution_status = SKIPPED`
  - `verification_status = UNKNOWN`
  - `stale_clear = true`
  - `stale_cleared_at` populated
  - `stale_cleared_by = autonomous-repair-approver-v1`
  - `stale_clear_proposal_id` populated with proposal id
  - `stale_clear_event_id` populated
  - `terminal_reason = LEASE_EXPIRED_CLEAR`
  - `terminal_reason_version = v1`
  - `executed_at` remained null
  - `verified_at` remained null
  - `verification_completed_at` remained null

Required proposal provenance verification
- `repair_proposals` row changed to:
  - `proposal_status = APPROVED`
  - `decided_at` populated
  - `decided_by = autonomous-repair-approver-v1`
  - `decision_reason` populated
  - `approval_mode = AUTO`
  - `approved_by_actor_type = SYSTEM`
  - `approved_by_actor_id = autonomous-repair-approver-v1`
  - `autonomy_tier_used = 1`

Required event trail verification
- `REPAIR_PROPOSAL_CREATED`
- `AUTO_APPROVAL_EVALUATION_STARTED`
- `AUTO_APPROVAL_ELIGIBLE`
- `STALE_LEASE_CANDIDATE_IDENTIFIED`
- `STALE_LEASE_CLEAR_APPROVED`
- `STALE_LEASE_CLEAR_EXECUTED`
- `STALE_LEASE_CLEAR_VERIFIED`

Cleanup
- remove synthetic proof artifacts after verification
- confirm cleanup completed successfully

Mandatory reset
- reset `CLEAR_EXPIRED_LEASE_MODE` back to `NOOP` after proof
- confirm post-proof operating posture is `NOOP`

## SQL checks
Proposal row
```sql
select
  id,
  proposal_status,
  action_type,
  target_kind,
  target_id,
  is_structured_intent,
  auto_approval_eligible,
  auto_approval_evaluated_at,
  auto_approval_rejection_code,
  approval_mode,
  approved_by_actor_type,
  approved_by_actor_id,
  autonomy_tier_used
from public.repair_proposals
where id = 'CLEAR_EXPIRED_LEASE_PROPOSAL_ID'::uuid;
```

Approval-event trail
```sql
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
  event_payload,
  created_at
from public.repair_approval_events
where repair_proposal_id = 'CLEAR_EXPIRED_LEASE_PROPOSAL_ID'::uuid
order by created_at asc;
```
Target repair-action row
```sql
select
  id,
  approval_status,
  execution_status,
  verification_status,
  stale_clear,
  stale_cleared_at,
  stale_cleared_by,
  stale_clear_proposal_id,
  stale_clear_event_id,
  terminal_reason,
  terminal_reason_version,
  executed_at,
  verified_at,
  verification_completed_at
from public.repair_action_runs
where id = 'CLEAR_EXPIRED_LEASE_TARGET_ACTION_RUN_ID'::uuid;
```
Operator notes
Prefer inline UUIDs in curl bodies if shell variables have been unreliable.
If a function behaves unexpectedly, inspect both:
function response
repair_approval_events
If proposal updates do not persist, check enforce_repair_proposal_immutability().
If approval provenance looks wrong in execution, inspect execute-repair-proposal before assuming DB corruption.
Rate-limit state interpretation
Cooldown and budget denials are treated as event/audit-only outcomes.
They do not mutate proposal-level denial state.

Interpretation rule
If a proposal is structurally valid but approval is denied for cooldown or budget reasons, the canonical operational record is:
repair_approval_events
not a proposal-row rejection marker.
For the bounded `CLEAR_EXPIRED_LEASE` NOOP path, the same governance principle applies:
the proof may establish eligibility and bounded approval behavior without introducing proposal-row approval provenance or target-row mutation.
For the bounded synthetic `MUTATE` path, mutation proof is legitimate only when the mode is intentionally elevated for bounded testing and then reset back to `NOOP`.
Final note
This runbook is not just a QA tool.
It is part of the governance surface.
A system that cannot be re-proven cannot be responsibly expanded.
