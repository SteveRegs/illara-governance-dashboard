Operational Launch Packet
Purpose
This document is the tactical continuity artifact used to start work safely in a new chat.
It is intentionally shorter and more operational than the full Continuity Packet.
Its purpose is to give the next chat the minimum exact information needed to:
verify current live state
avoid drift
avoid malformed commands
safely resume the immediate next task
This packet is designed for active working memory, not archival completeness.
1. Project Identity
Project name
Illara Governance Dashboard
Repo
illara-governance-dashboard
Supabase project ref
hwikvkhsujegdvuszlmc
Branch
main
Latest pushed commit
c683332 — docs(continuity): refresh pushed head references
Previous continuity commit
064ce77 — docs(continuity): add operational launch packet for chat transitions
Previous critical technical commit
24e0a4c — feat(governance): harden autonomous approval with recheck audit and rate limits
Current repo note
Repo is current on origin/main.
Intentional untracked folders may exist locally:
archive/
backups/
These are not by themselves drift indicators.
2. Current Live Autonomous Scope
Live allowlisted autonomous action
RERUN_HARNESS_VERIFICATION
Current autonomy tier
1
Current execution mode
NOOP
Current rulepack
tier1-safe-ops-v1
Current autonomous approver identity
autonomous-repair-approver-v1
Important boundary
No other action type is currently inside the autonomous approval boundary.
3. Current Hardening State
The following are live and already proven:
shadow rejection path
shadow eligibility path
autonomous approval path
autonomous execution provenance continuity
approval-time recheck
AUTO_APPROVAL_RECHECK_FAILED event
cooldown rate limiting
AUTO_APPROVAL_RATE_LIMITED event for cooldown
budget-trigger denial
AUTO_APPROVAL_RATE_LIMITED with AUTO_APPROVAL_BUDGET_EXCEEDED
Option A semantics verified
Cooldown and budget denials remain event/audit-only.
They do not mutate proposal-level denial state.
Denied proposals remain PROPOSED, structurally eligible, and without approval provenance written.
Canonical runtime denial record remains:
repair_approval_events
Important behavioral distinction
shadow eligibility is not enough for approval
approval-time recheck is a second legitimacy gate
cooldown check runs before budget check
4. Exact Active Constants
Cooldown
cooldown minutes: 10
Budget
budget window hours: 24
budget max per target: 3
Approval ordering
The autonomous approval gate currently evaluates:
proposal legitimacy / structured contract
approval-time recheck
cooldown
budget
autonomous approval
Because cooldown runs before budget, a rapid repeated approval attempt may be blocked by cooldown before budget can be observed.
5. Exact Next Task
Immediate next task
Complete a pure budget-trigger denial proof for approve-autonomous-repair.
Goal
Produce a denial where:
response indicates budget exceeded
event trail shows:
AUTO_APPROVAL_RATE_LIMITED
rejection_reason_code = AUTO_APPROVAL_BUDGET_EXCEEDED
Why still pending
Budget logic is implemented, but the most recent repeated approval attempt was blocked by cooldown before budget could trigger.
So the next proof must happen:
after cooldown no longer dominates
while the 24-hour approval count for the same target is already at 3
6. Exact Known-Good Commands Needed For The Next Task
Environment reload
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY ILLARA_WORKER_TOKEN ILLARA_APPROVER_TOKEN ILLARA_SERVICE_ROLE_KEY ILLARA_SUPABASE_URL
set -a
source ./.env.illara.canonical
set +a
Seed a failing harness run
curl -sS -X POST "$SUPABASE_URL/functions/v1/harness-run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --data '{
    "phase": "harness",
    "target_system": "governance_dashboard",
    "source": "PASTE_SOURCE_LABEL_HERE"
  }'
Shadow evaluate a proposal
curl -sS -X POST "$SUPABASE_URL/functions/v1/evaluate-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "PASTE_PROPOSAL_ID_HERE"
  }'
Attempt autonomous approval
curl -sS -X POST "$SUPABASE_URL/functions/v1/approve-autonomous-repair" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-illara-worker-token: $ILLARA_WORKER_TOKEN" \
  --data '{
    "proposal_id": "PASTE_PROPOSAL_ID_HERE"
  }'
7. Exact Known-Good SQL Needed For The Next Task
Find proposal id from run id
select
  id,
  run_id,
  proposal_status,
  is_structured_intent
from public.repair_proposals
where run_id = 'PASTE_RUN_ID_HERE'::uuid;
Shape proposal into valid structured Tier 1 candidate
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
where id = 'PASTE_PROPOSAL_ID_HERE'
returning
  id,
  proposal_status,
  is_structured_intent,
  action_type,
  target_id,
  rulepack_version;
Check 24-hour AUTO_APPROVED count for target
select
  count(*) as auto_approved_count_24h
from public.repair_approval_events
where event_type = 'AUTO_APPROVED'
  and action_type = 'RERUN_HARNESS_VERIFICATION'
  and target_kind = 'repair_proposal'
  and target_id = 'a9abcd07-426e-4c28-a8b0-523c2c868add'::uuid
  and created_at >= now() - interval '24 hours';
List AUTO_APPROVED events for target in 24h
select
  repair_proposal_id,
  event_type,
  created_at
from public.repair_approval_events
where event_type = 'AUTO_APPROVED'
  and action_type = 'RERUN_HARNESS_VERIFICATION'
  and target_kind = 'repair_proposal'
  and target_id = 'a9abcd07-426e-4c28-a8b0-523c2c868add'::uuid
  and created_at >= now() - interval '24 hours'
order by created_at asc;
Check resulting event trail for tested proposal
select
  event_type,
  actor_type,
  actor_id,
  action_type,
  target_kind,
  target_id,
  eligibility_result,
  rejection_reason_code,
  event_payload,
  created_at
from public.repair_approval_events
where repair_proposal_id = 'PASTE_PROPOSAL_ID_HERE'
order by created_at desc
limit 10;
8. Known Useful IDs
Current canonical target for structured Tier 1 regressions
a9abcd07-426e-4c28-a8b0-523c2c868add
Important note
This is a target_id, not a proposal id and not a run id.
Do not confuse:
run_id
proposal_id
target_id
9. Critical File Focus For Next Task
The next task is centered on these files:
supabase/functions/approve-autonomous-repair/index.ts
supabase/functions/_shared/autonomous-repair.ts
The currently relevant live behavior already exists there:
recheck failure handling
cooldown handling
budget handling
rate-limited event emission
The next task is proof, not redesign.
10. Known Trap Notes
Trap 1
Do not confuse run_id with proposal_id.
Trap 2
Cooldown runs before budget.
A rapid retry may prove cooldown, not budget.
Trap 3
A successful autonomous approval for the same target inside the last 10 minutes means cooldown should fire first.
Trap 4
To prove pure budget denial, the approval attempt must happen:
after cooldown is no longer active
while 24-hour count is already at 3
Trap 5
Do not resume work by inventing commands or schema. Use the known-good command/query set above.
11. Backup / Ops Note
Code backup
Complete. Latest continuity and hardening work is pushed to origin/main.
Schema dump backup
Pending Docker installation/running in this environment.
This does not block the next technical proof task.
12. Launch Verification Requirement
Before substantive work begins in a new chat, the new chat must explicitly confirm:
project identity
live autonomous scope
hardening state
active constants
known-good commands
known-good SQL
exact next task
If confidence is not high, do not proceed.
Final instruction for next chat
Do not redesign the system from scratch.
Resume from the current frontier:
bounded autonomous repair v1 is live
cooldown is proven
budget logic is live
next task is pure budget-trigger denial proof
The work should begin by verifying the current 24-hour AUTO_APPROVED count for target:
a9abcd07-426e-4c28-a8b0-523c2c868add
and then deciding whether the next structured approval attempt should produce the budget denial directly or whether cooldown still needs to expire first.