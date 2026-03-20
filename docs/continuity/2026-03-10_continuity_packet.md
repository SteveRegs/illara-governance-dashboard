Continuity Packet
1. Project Identity
Project name
Illara Governance Dashboard
Repo name
illara-governance-dashboard
Supabase project ref
hwikvkhsujegdvuszlmc
Primary branch
main
Latest pushed commit
5493090 — docs(continuity): record Option A fidelity verification
Latest local commit if different
3a15a22 — feat(governance): add clear-expired-lease proposal generation path
Current repo cleanliness
 clean working tree except intentional untracked file/folder state
 uncommitted changes present
 intentional untracked files present
Notes
93ab490 — detection and recheck NOOP path
Intentional untracked items:
archive/
backups/
These have been intentionally left untracked and should not be treated as drift by themselves.
2. Current Phase
Current project phase
Phase 3 bounded governed expansion — CLEAR_EXPIRED_LEASE implementation entry

Short description
The project remains in Phase 3 and has advanced from autonomous repair v1 hardening into bounded governed expansion for the next safe action. The original Tier 1 live lane remains unchanged in deployed scope, still centered on `RERUN_HARNESS_VERIFICATION` under NOOP execution discipline. In the current local implementation cycle, `CLEAR_EXPIRED_LEASE` has moved from planning-complete into bounded code implementation. Recent work completed:
- `CLEAR_EXPIRED_LEASE` approval-path entry in `approve-autonomous-repair`
- Slice 1 stale-candidate detection against `repair_action_runs`
- Slice 2 approval-time recheck with fail-closed behavior
- explicit stale-lease event vocabulary for candidate identification and recheck failure
- shared contract alignment to the locked stale `repair_action_runs` lease-anchor semantics
- new dedicated proposal-generation function: `propose-clear-expired-lease`
- validated local chain now exists for:
  - proposal generation
  - shadow evaluation
  - approval-time detection/recheck NOOP path

This work is still intentionally pre-deploy and pre-mutation for `CLEAR_EXPIRED_LEASE`. No stale-terminal row mutation, metadata writes, or executor changes for this action have been introduced yet. The immediate next phase activity is deployment and proof of the bounded propose → evaluate → approve NOOP chain.

Current session boundary type
 stable checkpoint
 mid-hardening checkpoint
 failed test checkpoint
 migration checkpoint
 deployment checkpoint
 other: bounded implementation-entry checkpoint
3. Current Live Scope
Live autonomous scope
The system currently supports bounded autonomous approval and governed execution only for a very narrow Tier 1 repair case.
Active allowlist
RERUN_HARNESS_VERIFICATION
Explicitly blocked / out of scope
Not autonomously approved:
schema or migration changes
RLS or policy changes
secret or credential changes
destructive repair actions
external service actions
freeform repair prose
unstructured proposals
medium/high/unknown risk proposals
action types outside the live allowlist
direct execution from shadow evaluation
automatic autonomy expansion from learning behavior
Current autonomy tier
1
Current execution mode
NOOP only
Current rulepack version
tier1-safe-ops-v1
Current approval actor
autonomous-repair-approver-v1
Current verification posture
Autonomous approval remains separate from execution. Approval requires shadow eligibility plus approval-time recheck. Execution continues through the governed repair pathway and preserves provenance into action runs, verification, and learning records.
4. Current Live Behavior
Shadow evaluation behavior
evaluate-autonomous-repair:
evaluates only PROPOSED proposals
rejects unstructured proposals with explicit rejection codes
marks valid structured Tier 1 proposals as eligible in shadow mode
writes:
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_REJECTED
or AUTO_APPROVAL_ELIGIBLE
persists:
auto_approval_eligible
auto_approval_evaluated_at
auto_approval_rejection_code
Autonomous approval behavior
approve-autonomous-repair:
only supports RERUN_HARNESS_VERIFICATION in current live v1 scope
requires proposal to still satisfy the Tier 1 structured contract
writes AUTO_APPROVED on success
updates proposal provenance fields:
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
Approval-time recheck behavior
Approval does not trust prior shadow eligibility blindly.
At approval time it rechecks:
proposal_status = PROPOSED
is_structured_intent = true
active Tier 1 action type
auto_approval_eligible = true
risk_class = LOW
autonomy_tier_requested = 1
rulepack_version = tier1-safe-ops-v1
auto_approval_rejection_code = null
structured contract still valid
verification plan type still eligible
required precondition keys still present
If any of these fail, the function denies approval and writes:
AUTO_APPROVAL_RECHECK_FAILED
Rate-limit behavior
Cooldown is live.
Current cooldown logic:
same action_type
same target_kind
same target_id
prior AUTO_APPROVED within 10 minutes
then deny with:
response error: cooldown active
event: AUTO_APPROVAL_RATE_LIMITED
rejection reason: AUTO_APPROVAL_COOLDOWN_ACTIVE
Budget logic is also implemented:
24-hour rolling window
max 3 autonomous approvals per target
if exceeded, deny with:
AUTO_APPROVAL_RATE_LIMITED
AUTO_APPROVAL_BUDGET_EXCEEDED
As of this packet revision, cooldown has been explicitly proven and a pure budget-trigger denial has also been explicitly proven.
The budget proof was completed by first bringing the canonical target to 3 AUTO_APPROVED events inside the rolling 24-hour window, then waiting for cooldown expiry, then submitting a fresh valid structured Tier 1 proposal for the same target.
The resulting denial produced:
response error: Autonomous approval budget exceeded
event: AUTO_APPROVAL_RATE_LIMITED
rejection reason: AUTO_APPROVAL_BUDGET_EXCEEDED
Decision
Rate-limited denials remain event/audit-only.
Cooldown and budget denials do not mutate proposal-level denial state.
Rationale:
rate limiting is an operational throttle, not a structural illegitimacy marker.
Rate-limit state verification
Option A semantics have now been verified against:
live code behavior in approve-autonomous-repair
historical cooldown-denied proposal state
historical budget-denied proposal state
Verified result
Cooldown and budget denials:
do emit AUTO_APPROVAL_RATE_LIMITED events
do return denial responses at approval time
do not write proposal-level denial state
do not mutate auto_approval_rejection_code
do not write approval provenance
leave the denied proposal in PROPOSED with structural eligibility state intact
Execution provenance behavior
execute-repair-proposal no longer assumes human provenance.
It reads provenance from repair_proposals and preserves it into:
repair_action_runs
repair_approval_events
learning_records
function response payload
For autonomous approvals this preserves:
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
rulepack_version = tier1-safe-ops-v1
Verification behavior
Execution writes verification results and updates action runs with:
verification_outcome
verification_completed_at
Learning behavior
learning_records preserve autonomous context, including:
action_type
proposal_reason_code
verification_outcome
rulepack_version
autonomy_tier_used
5. Current Active Constants and Boundaries
Allowlisted action types
RERUN_HARNESS_VERIFICATION
Cooldown settings
cooldown minutes: 10
Budget settings
budget window hours: 24
budget max per target: 3
Required structured fields
A valid structured Tier 1 proposal currently requires:
action_type
target_kind
target_id
reason_code
risk_class
autonomy_tier_requested
preconditions_json
verification_plan_json
proposal_evidence_json
rulepack_version
Active rejection codes added recently
Recent/currently important rejection codes include:
PROPOSAL_NOT_PROPOSED
PROPOSAL_NOT_STRUCTURED
ACTION_TYPE_NOT_ACTIVE
ACTION_TYPE_NOT_ELIGIBLE_V1
AUTO_APPROVAL_NOT_ELIGIBLE
RISK_CLASS_NOT_LOW
AUTONOMY_TIER_NOT_1
RULEPACK_VERSION_MISMATCH
REJECTION_CODE_PRESENT
STRUCTURED_CONTRACT_INVALID_AT_RECHECK
VERIFICATION_PLAN_TYPE_INELIGIBLE
REQUIRED_PRECONDITIONS_MISSING
AUTO_APPROVAL_COOLDOWN_ACTIVE
AUTO_APPROVAL_BUDGET_EXCEEDED
Active event types added recently
Recent/currently important event types include:
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVAL_REJECTED
AUTO_APPROVAL_RECHECK_FAILED
AUTO_APPROVAL_RATE_LIMITED
AUTO_APPROVED
Known ordering assumptions
approval-time recheck happens after shadow eligibility
cooldown check runs before budget check
rate-limited denial can occur even when proposal remains structurally valid
shadow eligibility is not the same thing as approval-time legitimacy
6. Current Critical Files
Functions
supabase/functions/propose-clear-expired-lease/index.ts
supabase/functions/approve-autonomous-repair/index.ts
supabase/functions/evaluate-autonomous-repair/index.ts
supabase/functions/execute-repair-proposal/index.ts
supabase/functions/approve-repair-proposal/index.ts
Shared files
supabase/functions/_shared/autonomous-repair.ts
Migrations
supabase/migrations/20260227_remote_history_placeholder.sql
supabase/migrations/20260307110000_idempotency_active_unique_index.sql
supabase/migrations/20260307120000_autonomous_repair_tier1_baseline.sql
supabase/migrations/20260308160000_autonomous_repair_approval_fields.sql
supabase/migrations/20260308170000_repair_proposal_immutability_and_autonomy_finalize.sql
Documentation
docs/autonomous_repair_v1_milestone.md
docs/autonomous_repair_v1_regression_runbook.md
docs/continuity/2026-03-10_handoff_operating_procedure.md
docs/continuity/2026-03-10_continuity_packet_template.md
docs/continuity/2026-03-10_continuity_verification_checklist.md
Sensitive files / caution files
Do not modify casually:
supabase/functions/_shared/autonomous-repair.ts
supabase/functions/approve-autonomous-repair/index.ts
supabase/functions/execute-repair-proposal/index.ts
public.enforce_repair_proposal_immutability() logic as represented through migrations
7. Database and Migration State
Migration ledger status
 local and remote aligned
 known drift exists
 unknown / must verify
Previously verified aligned ledger included:
20260227
20260307110000
20260307120000
20260308160000
20260308170000
Current relevant migrations
20260227_remote_history_placeholder.sql
20260307110000_idempotency_active_unique_index.sql
20260307120000_autonomous_repair_tier1_baseline.sql
20260308160000_autonomous_repair_approval_fields.sql
20260308170000_repair_proposal_immutability_and_autonomy_finalize.sql
Known direct SQL changes not yet codified
None known as of this packet. Recent direct-SQL adjustments were reconciled into tracked migrations prior to current hardening work.
Known trigger/function adjustments
The final immutability behavior for repair_proposals supports:
bounded proposal shaping while status remains PROPOSED
decision/evaluation/provenance fields after creation
immutability otherwise
Backup status
code backup: complete (origin/main currently at 5493090 before this packet revision)
schema dump backup: complete
notes:
Docker Desktop is now installed and verified via `docker info`.
Successful schema dump created:
backups/illara_schema_20260314_133822.sql
Earlier zero-byte dump artifacts remain in backups/ from failed attempts and may be cleaned up later.
8. Validated Regression Proofs
Proven positive-path regressions
 unstructured shadow rejection path proven
 structured shadow eligibility path proven
 autonomous approval path proven
 autonomous execution provenance continuity proven
 learning record autonomous context persistence proven
 hardened approval-time recheck still allows valid structured proposal approval
Proven fail-closed regressions
 unstructured proposal rejected in shadow mode
 drifted proposal blocked at approval time
 AUTO_APPROVAL_RECHECK_FAILED event emission proven
 proposal remains PROPOSED when recheck fails
 no approval provenance written on recheck failure
Proven rate-limit regressions
 cooldown logic does not break happy path when cooldown not active
 cooldown denial proven
 AUTO_APPROVAL_RATE_LIMITED with AUTO_APPROVAL_COOLDOWN_ACTIVE proven
 pure budget-trigger denial proven
 AUTO_APPROVAL_RATE_LIMITED with AUTO_APPROVAL_BUDGET_EXCEEDED proven
 Option A semantics verified: cooldown and budget denials remain event/audit-only and do not mutate proposal-level denial state
Proven provenance continuity regressions
 auto approval provenance preserved into repair_action_runs
 auto approval provenance preserved into repair_approval_events
 auto approval context preserved into learning_records
Still unproven / pending
No currently open backup blocker.
9. Known-Good Commands
Environment reload
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY ILLARA_WORKER_TOKEN ILLARA_APPROVER_TOKEN ILLARA_SERVICE_ROLE_KEY ILLARA_SUPABASE_URL
set -a
source ./.env.illara.canonical
set +a
Git safety commands
git status
git log --oneline -5
git push origin main
Deploy commands
supabase functions deploy propose-clear-expired-lease --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy approve-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy evaluate-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy execute-repair-proposal --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy approve-repair-proposal --project-ref hwikvkhsujegdvuszlmc
Migration commands
supabase migration list
supabase db push
Backup commands
supabase link --project-ref hwikvkhsujegdvuszlmc
supabase db dump -f backups/illara_schema_$(date +%Y%m%d_%H%M%S).sql
Known-good curl commands
Shadow evaluation:
curl -sS -X POST "$SUPABASE_URL/functions/v1/evaluate-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "PASTE_PROPOSAL_ID_HERE"
  }'
Autonomous approval:
curl -sS -X POST "$SUPABASE_URL/functions/v1/approve-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "PASTE_PROPOSAL_ID_HERE"
  }'
Execution:
curl -sS -X POST "$SUPABASE_URL/functions/v1/execute-repair-proposal" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "PASTE_PROPOSAL_ID_HERE",
    "mode": "NOOP",
    "actor_id": "repair-worker"
  }'
Harness seed:
curl -sS -X POST "$SUPABASE_URL/functions/v1/harness-run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --data '{
    "phase": "harness",
    "target_system": "governance_dashboard",
    "source": "PASTE_SOURCE_LABEL_HERE"
  }'
Notes
Inline UUIDs are often safer than relying on shell variables if clipboard/session state is flaky.
Deploy commands using --project-ref are valid even when db dump needed linking.
supabase status is not a reliable remote-project check in this environment because it is tied to local Docker stack inspection.
10. Known-Good SQL Queries
Proposal lookup by run_id
select
  id,
  run_id,
  proposal_status,
  is_structured_intent
from public.repair_proposals
where run_id = 'PASTE_RUN_ID_HERE'::uuid;
Proposal state query
select
  id,
  proposal_status,
  approval_mode,
  approved_by_actor_type,
  approved_by_actor_id,
  autonomy_tier_used,
  auto_approval_eligible,
  auto_approval_rejection_code,
  verification_plan_json
from public.repair_proposals
where id = 'PASTE_PROPOSAL_ID_HERE';
Approval-event trail query
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
where repair_proposal_id = 'PASTE_PROPOSAL_ID_HERE'
order by created_at desc
limit 10;
Action run query
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
where id = 'PASTE_ACTION_RUN_ID_HERE';
Learning record query
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
where action_run_id = 'PASTE_ACTION_RUN_ID_HERE'
order by created_at desc;
24-hour approval count query
select
  count(*) as auto_approved_count_24h
from public.repair_approval_events
where event_type = 'AUTO_APPROVED'
  and action_type = 'RERUN_HARNESS_VERIFICATION'
  and target_kind = 'repair_proposal'
  and target_id = 'PASTE_TARGET_ID_HERE'::uuid
  and created_at >= now() - interval '24 hours';
24-hour approval listing query
select
  repair_proposal_id,
  event_type,
  created_at
from public.repair_approval_events
where event_type = 'AUTO_APPROVED'
  and action_type = 'RERUN_HARNESS_VERIFICATION'
  and target_kind = 'repair_proposal'
  and target_id = 'PASTE_TARGET_ID_HERE'::uuid
  and created_at >= now() - interval '24 hours'
order by created_at asc;
Notes
These queries are central to current operational continuity.
Querying repair_approval_events is often the fastest way to understand what actually happened.
For this project, event trails are frequently more reliable as operational truth than memory alone.
11. Known Useful IDs / Targets
Useful target ids
a9abcd07-426e-4c28-a8b0-523c2c868add — canonical recent target used in structured Tier 1 regressions
Useful proposal ids
These are useful only as historical references and may no longer be in actionable state:
ef9ad2a3-048f-459a-b3f7-40091cba1d26 — early successful structured eligible/auto-approved proposal path
c9095d42-deab-46f1-9ca1-f6bda842735f — drifted proposal used to prove approval-time recheck failure and AUTO_APPROVAL_RECHECK_FAILED
f36d0d91-6655-424b-ab3f-a4c0c2792204 — cooldown rate-limited proposal
93445a69-1ba6-425d-9755-d842ceb42b0a — successful approval after cooldown logic introduced
467ce838-5b9f-4a65-8a93-c845c830f618 — pure budget-trigger denial proposal proving AUTO_APPROVAL_BUDGET_EXCEEDED
Useful run ids
Generally less useful once mapped to proposals. Be careful not to confuse them with proposal ids.
Notes
Historical ids are useful for interpreting prior regressions, not for assuming present actionable state.
12. Known Traps / Anti-Drift Notes
Identity confusion risks
Do not confuse run_id with proposal_id
run_id comes from harness runs
proposal_id is the repair_proposals.id row used by evaluation and approval functions
Tooling/environment risks
supabase status is local/Docker-oriented in this environment
supabase db dump currently requires Docker availability here
db dump remote backup is pending Docker install/run
function deploys with --project-ref are fine even when db dump needs link/Docker
Secret/env risks
SUPABASE_* reserved secret behavior caused earlier confusion; project now often uses ILLARA_SERVICE_ROLE_KEY path for reliability
if curl says “No host part in the URL,” SUPABASE_URL is not loaded in current shell
Behavioral interpretation risks
shadow eligibility is not enough for approval
approval-time recheck is a second legitimacy gate
cooldown can block before budget
a valid proposal may still be denied for rate reasons
AUTO_APPROVAL_RATE_LIMITED is not the same thing as AUTO_APPROVAL_RECHECK_FAILED
Schema/migration risks
if something looks wrong, do not assume schema from memory; inspect current rows or migration ledger
this project is now detailed enough that stale assumptions are dangerous
13. Current Open Work
Immediate next task
Deploy and prove the bounded `CLEAR_EXPIRED_LEASE` implementation chain in the next session.

Secondary next task
After deploy/proof, decide whether any additional bounded executor or metadata work for `CLEAR_EXPIRED_LEASE` should be introduced, or whether the path should remain proposal/evaluation/approval-only for another iteration.

Explicitly deferred work
scope expansion beyond RERUN_HARNESS_VERIFICATION
non-NOOP execution behavior
additional allowlisted action types such as CLEAR_EXPIRED_LEASE

Things not to touch casually
live Tier 1 allowlist
approval-time recheck semantics
provenance fields and execution provenance flow
immutability behavior represented by reconciled migrations
14. Current Resume Point
Resume from here
The project is at a stable bounded implementation checkpoint within Phase 3 governed expansion. The original live autonomous lane remains unchanged and still consists of Tier 1 `RERUN_HARNESS_VERIFICATION` under NOOP execution mode. The newest local work has advanced `CLEAR_EXPIRED_LEASE` from planning into bounded implementation. The following now exist locally:
- approval-path entry for `CLEAR_EXPIRED_LEASE` in `approve-autonomous-repair`
- Slice 1 stale-candidate detection against `repair_action_runs`
- Slice 2 approval-time recheck with fail-closed behavior
- shared contract alignment for `CLEAR_EXPIRED_LEASE` to the locked stale `repair_action_runs` lease-anchor semantics
- new proposal-generation function: `propose-clear-expired-lease`
- locally validated propose → evaluate → approve NOOP chain components

This work has not yet been pushed or deployed. No real stale-terminal mutation has been implemented for `CLEAR_EXPIRED_LEASE`, and no executor mutation path exists yet for that action.

First verification step in next chat
Restate:
- current pushed head versus latest local commits
- current live autonomous scope
- current local non-live `CLEAR_EXPIRED_LEASE` implementation state
- locked lease anchor: `repair_action_runs`
- locked stale-window / cooldown distinction:
  - cooldown = 24 hours
  - stale window = 48 hours
- current bounded `CLEAR_EXPIRED_LEASE` chain:
  1. propose stale-clear candidate
  2. evaluate autonomous eligibility in shadow mode
  3. approve through detection + approval-time recheck NOOP path
- what remains intentionally out of scope:
  - stale-terminal mutation
  - stale-clear metadata writes
  - executor changes for `CLEAR_EXPIRED_LEASE`

First operational task after verification
Deploy the three relevant functions in the correct order:
1. `propose-clear-expired-lease`
2. `evaluate-autonomous-repair`
3. `approve-autonomous-repair`

Then run the bounded proof sequence:
1. POST to `propose-clear-expired-lease`
2. if proposal exists, POST to `evaluate-autonomous-repair` with `proposal_id`
3. POST to `approve-autonomous-repair` with the same `proposal_id`

Expected result:
- proposal generation succeeds or reports no stale candidate / existing active proposal
- evaluation marks the proposal eligible in shadow mode
- approval succeeds only through the NOOP detection/recheck path or fails closed if the candidate drifts
15. Continuity Confidence
Continuity confidence
 high
 medium
 low
Why this confidence level was chosen
The current live scope, recent regressions, recent hardening, operational commands, SQL queries, and known traps are all explicitly captured. The main remaining loose end is Docker-dependent schema dump backup, which is operationally known and isolated.
What should be checked first if continuity feels uncertain
latest pushed commit (064ce77)
current live allowlist and rate-limit settings
latest proven regressions
current behavior of approve-autonomous-repair
known-good SQL event trail query
16. Optional Attachments / References
Related docs
docs/autonomous_repair_v1_milestone.md
docs/autonomous_repair_v1_regression_runbook.md
Related continuity docs
docs/continuity/2026-03-10_handoff_operating_procedure.md
docs/continuity/2026-03-10_continuity_packet_template.md
docs/continuity/2026-03-10_continuity_verification_checklist.md
Related migrations
supabase/migrations/20260227_remote_history_placeholder.sql
supabase/migrations/20260307110000_idempotency_active_unique_index.sql
supabase/migrations/20260307120000_autonomous_repair_tier1_baseline.sql
supabase/migrations/20260308160000_autonomous_repair_approval_fields.sql
supabase/migrations/20260308170000_repair_proposal_immutability_and_autonomy_finalize.sql
Final note
This packet is intended to preserve operational truth across chat transitions.
If any future chat cannot correctly restate the current live scope, recent hardening state, and next operational step from this packet, continuity should be treated as insufficient and work should pause until re-anchored.
17. Current non-live local advancement
CLEAR_EXPIRED_LEASE now has local proposal-generation path
shared contract aligned
approval NOOP path implemented
pending deploy/proof next session
