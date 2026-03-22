Operational Launch Packet

Purpose  
This document is the tactical continuity artifact used to start work safely in a new chat.  
It is intentionally shorter and more operational than the full Continuity Packet.  
Its purpose is to give the next chat the minimum exact information needed to:
- verify current live state
- avoid drift
- avoid malformed commands
- safely resume the immediate next task

This packet is designed for active working memory, not archival completeness.

## 1. Project Identity

Project name  
Illara Governance Dashboard

Repo  
illara-governance-dashboard

Supabase project ref  
hwikvkhsujegdvuszlmc

Branch  
main

Latest pushed commit  
`6631ed9` — `docs(runbook): add clear-expired-lease proof procedure`

Latest local commit if different  
same as pushed head

Related earlier local commit in same work session  
`93ab490` — `feat(governance): add clear-expired-lease detection and recheck noop path`

Previous continuity commit  
`064ce77` — `docs(continuity): add operational launch packet for chat transitions`

Previous critical technical commit  
`24e0a4c` — `feat(governance): harden autonomous approval with recheck audit and rate limits`

Current repo note  
Bounded `CLEAR_EXPIRED_LEASE` implementation work is now included in the current pushed history.  
`CLEAR_EXPIRED_LEASE` is now mutation-proven in bounded synthetic conditions, but the post-proof operating posture has been reset to `NOOP`.  
Intentional untracked folders may exist locally:
- `archive/`
- `backups/`

These are not by themselves drift indicators.

## 2. Current Live Autonomous Scope

Live allowlisted autonomous action  
`RERUN_HARNESS_VERIFICATION`

Current autonomy tier  
`1`

Current execution mode  
`NOOP`

Current rulepack  
`tier1-safe-ops-v1`

Current autonomous approver identity  
`autonomous-repair-approver-v1`

Important boundary  
No other action type is currently live allowlisted for autonomous execution.  
`CLEAR_EXPIRED_LEASE` is not yet broad live autonomous mutation scope.  
It is mutation-proven only in bounded synthetic conditions and is reset to `NOOP` post-proof.

## 3. Current Deployed Non-Live Expansion State

The following now exist in the current codebase and are now deployed remotely:

- bounded `CLEAR_EXPIRED_LEASE` approval-path entry in `approve-autonomous-repair`
- Slice 1 stale-candidate detection against `repair_action_runs`
- Slice 2 approval-time recheck with fail-closed behavior
- bounded Stage 2 mutation path gated by `CLEAR_EXPIRED_LEASE_MODE`
- explicit stale-lease event vocabulary:
  - `STALE_LEASE_CANDIDATE_IDENTIFIED`
  - `STALE_LEASE_CLEAR_RECHECK_FAILED`
  - `STALE_LEASE_CLEAR_APPROVED`
  - `STALE_LEASE_CLEAR_EXECUTED`
  - `STALE_LEASE_CLEAR_VERIFIED`
- shared contract alignment for `CLEAR_EXPIRED_LEASE` to the locked stale `repair_action_runs` lease-anchor semantics
- new function:
  - `supabase/functions/propose-clear-expired-lease/index.ts`

Remote bounded chains now exist:
1. propose stale-clear candidate
2. evaluate autonomous eligibility in shadow mode
3. approve through detection + approval-time recheck NOOP path
4. bounded synthetic mutate through guarded terminal stale-clear path when `CLEAR_EXPIRED_LEASE_MODE=MUTATE`

Important boundary  
This work is still intentionally not broad live mutation scope.  
Mutation is now proven only in bounded synthetic conditions.  
Post-proof operating posture is reset to `NOOP` unless intentionally changed for bounded testing.

Remote bounded proof result  
The first remote proof call to `propose-clear-expired-lease` returned:
- `NO_STALE_CANDIDATE`

SQL verification confirmed:
- no rows matched the 48-hour stale-candidate criteria
- no near-miss rows existed in the approved / not-started / not-verified slice

This means the initial bounded proof stopped correctly because no eligible remote target existed at that moment.

Controlled synthetic proof completion  
After the initial remote no-target proof stop, a controlled synthetic stale candidate was created and used for proof.

The full bounded chain was then proven:
1. `propose-clear-expired-lease` created a valid structured `CLEAR_EXPIRED_LEASE` proposal
2. `evaluate-autonomous-repair` marked it eligible in shadow mode
3. `approve-autonomous-repair` returned bounded NOOP success

SQL verification confirmed:
- the proposal remained `PROPOSED` while eligible
- approval provenance was not written to the proposal row in this NOOP path
- the target `repair_action_runs` row remained unchanged
- no stale-clear mutation occurred

Cleanup completed successfully and removed the synthetic proof artifacts.

Bounded NOOP regression proof after Stage 2 patching  
The Stage 1 NOOP proof was re-run successfully after Stage 2 patching:
- a controlled synthetic stale candidate was created
- `propose-clear-expired-lease` created a valid structured `CLEAR_EXPIRED_LEASE` proposal
- `evaluate-autonomous-repair` returned eligible in `SHADOW` mode
- `approve-autonomous-repair` returned `ok: true`, `noop: true`, with message confirming Slice 1 detection and Slice 2 approval-time recheck passed

SQL verification confirmed:
- the target `repair_action_runs` row remained unchanged
- the proposal remained `PROPOSED`
- no approval provenance was written
- no stale-clear metadata was written

Cleanup completed successfully and removed the synthetic proof artifacts.

Bounded synthetic `MUTATE` proof result  
A fresh controlled synthetic stale candidate was then used to complete Stage 2 proof:
- `propose-clear-expired-lease` created a valid structured `CLEAR_EXPIRED_LEASE` proposal
- `evaluate-autonomous-repair` returned eligible in `SHADOW` mode
- `approve-autonomous-repair` returned:
  - `ok: true`
  - `approved: true`
  - `autonomous: true`
  - `noop: false`
  - `mode: MUTATE`
  - `mutated: true`
  - `verified: true`

SQL verification confirmed the target `repair_action_runs` row terminalized to:
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

SQL verification confirmed the `repair_proposals` row changed to:
- `proposal_status = APPROVED`
- `decided_at` populated
- `decided_by = autonomous-repair-approver-v1`
- `decision_reason` populated
- `approval_mode = AUTO`
- `approved_by_actor_type = SYSTEM`
- `approved_by_actor_id = autonomous-repair-approver-v1`
- `autonomy_tier_used = 1`

Verified `repair_approval_events` trail included:
- `REPAIR_PROPOSAL_CREATED`
- `AUTO_APPROVAL_EVALUATION_STARTED`
- `AUTO_APPROVAL_ELIGIBLE`
- `STALE_LEASE_CANDIDATE_IDENTIFIED`
- `STALE_LEASE_CLEAR_APPROVED`
- `STALE_LEASE_CLEAR_EXECUTED`
- `STALE_LEASE_CLEAR_VERIFIED`

Cleanup completed successfully and removed the synthetic proof artifacts.  
`CLEAR_EXPIRED_LEASE_MODE` was reset back to `NOOP` after proof.

## 4. Current Hardening State

The following are live and already proven:
- shadow rejection path
- shadow eligibility path
- autonomous approval path
- autonomous execution provenance continuity
- approval-time recheck
- `AUTO_APPROVAL_RECHECK_FAILED` event
- cooldown rate limiting
- `AUTO_APPROVAL_RATE_LIMITED` event for cooldown
- budget-trigger denial
- `AUTO_APPROVAL_RATE_LIMITED` with `AUTO_APPROVAL_BUDGET_EXCEEDED`
- Option A semantics verified

Additional bounded non-live proof state
- `CLEAR_EXPIRED_LEASE` Stage 1 NOOP regression proof re-run passed after Stage 2 patching
- `CLEAR_EXPIRED_LEASE` Stage 2 bounded synthetic `MUTATE` proof passed
- `CLEAR_EXPIRED_LEASE` is mutation-proven in bounded synthetic conditions
- `CLEAR_EXPIRED_LEASE` is reset to `NOOP` post-proof and is not yet broad live mutation scope

Option A semantics verified  
Cooldown and budget denials remain event/audit-only.  
They do not mutate proposal-level denial state.  
Denied proposals remain `PROPOSED`, structurally eligible, and without approval provenance written.  
Canonical runtime denial record remains:  
`repair_approval_events`

Schema dump backup completed  
Docker Desktop is now installed and verified via `docker info`.  
Successful local schema dump created:  
`backups/illara_schema_20260314_133822.sql`

Important behavioral distinction
- shadow eligibility is not enough for approval
- approval-time recheck is a second legitimacy gate
- cooldown check runs before budget check

## 5. Exact Active Constants

Cooldown  
- cooldown minutes: `10`

Budget  
- budget window hours: `24`
- budget max per target: `3`

Stale-clear parameter distinction  
- stale window hours: `48`
- cooldown and stale window are intentionally different governance meanings

Approval ordering  
The autonomous approval gate currently evaluates:
1. proposal legitimacy / structured contract
2. approval-time recheck
3. cooldown
4. budget
5. autonomous approval

Because cooldown runs before budget, a rapid repeated approval attempt may be blocked by cooldown before budget can be observed.

## 6. Exact Next Task

Immediate next task  
Preserve the completed bounded `CLEAR_EXPIRED_LEASE` proof state and use it as the reference checkpoint for any later expansion decision.

Goal  
Keep the current boundary explicit:
1. bounded proof is complete
2. mutation is proven only in bounded synthetic conditions
3. any future expansion must be a separate decision

Why this is the next task  
The bounded implementation has now been deployed successfully, the NOOP regression proof has been re-run successfully after Stage 2 patching, and the bounded synthetic `MUTATE` proof has been completed and reset to `NOOP`.

Current checkpoint summary  
`CLEAR_EXPIRED_LEASE` now has:
- proposal generation
- shadow evaluation compatibility
- approval-time detection and recheck NOOP path
- bounded Stage 2 mutation path
- successful deployment of:
  - `propose-clear-expired-lease`
  - `evaluate-autonomous-repair`
  - `approve-autonomous-repair`
- bounded remote proof showing:
  - correct initial no-target stop behavior
  - completed synthetic propose -> evaluate -> approve NOOP proof
  - successful NOOP regression re-proof after Stage 2 patching
  - completed bounded synthetic `MUTATE` proof
  - successful cleanup of synthetic proof artifacts

This checkpoint is now mutation-proven in bounded synthetic conditions.  
It remains intentionally not broad live autonomous mutation scope, and the operating posture after proof reset is `NOOP`.

## 7. Exact Deploy Order For Latest Remote Proof

Completed on 2026-03-21 in this order:

```bash
supabase functions deploy propose-clear-expired-lease --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy evaluate-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy approve-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
```

Latest bounded remote proof sequence after deploy:
- `propose-clear-expired-lease` returned `NO_STALE_CANDIDATE`
- SQL confirmed there was no eligible remote stale candidate at that moment
- a controlled synthetic stale candidate was then created for proof
- `propose-clear-expired-lease` created a valid structured `CLEAR_EXPIRED_LEASE` proposal
- `evaluate-autonomous-repair` marked it eligible in shadow mode
- `approve-autonomous-repair` returned bounded NOOP success
- SQL confirmed:
  - proposal remained `PROPOSED` while eligible
  - no approval provenance was written to the proposal row in this NOOP path
  - target `repair_action_runs` row remained unchanged
  - no stale-clear mutation occurred
- cleanup removed the synthetic proof artifacts successfully
- after Stage 2 patching, the bounded NOOP regression proof was re-run successfully with the same preserved NOOP semantics
- a fresh controlled synthetic stale candidate was then created for bounded `MUTATE` proof
- `propose-clear-expired-lease` created a valid structured `CLEAR_EXPIRED_LEASE` proposal
- `evaluate-autonomous-repair` marked it eligible in shadow mode
- `approve-autonomous-repair` returned `ok: true`, `approved: true`, `autonomous: true`, `noop: false`, `mode: MUTATE`, `mutated: true`, `verified: true`
- SQL confirmed the target `repair_action_runs` row was terminalized with:
  - `approval_status = SKIPPED`
  - `execution_status = SKIPPED`
  - `verification_status = UNKNOWN`
  - `stale_clear = true`
  - `stale_cleared_at` populated
  - `stale_cleared_by = autonomous-repair-approver-v1`
  - `stale_clear_proposal_id` populated
  - `stale_clear_event_id` populated
  - `terminal_reason = LEASE_EXPIRED_CLEAR`
  - `terminal_reason_version = v1`
  - `executed_at` remained null
  - `verified_at` remained null
  - `verification_completed_at` remained null
- SQL confirmed the proposal row was updated to `APPROVED` with autonomous provenance written
- verified `repair_approval_events` trail included:
  - `REPAIR_PROPOSAL_CREATED`
  - `AUTO_APPROVAL_EVALUATION_STARTED`
  - `AUTO_APPROVAL_ELIGIBLE`
  - `STALE_LEASE_CANDIDATE_IDENTIFIED`
  - `STALE_LEASE_CLEAR_APPROVED`
  - `STALE_LEASE_CLEAR_EXECUTED`
  - `STALE_LEASE_CLEAR_VERIFIED`
- cleanup removed the synthetic proof artifacts successfully
- `CLEAR_EXPIRED_LEASE_MODE` was reset back to `NOOP` after proof
