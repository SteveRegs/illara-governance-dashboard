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
`5493090` — `docs(continuity): record Option A fidelity verification`

Latest local commit if different  
`3a15a22` — `feat(governance): add clear-expired-lease proposal generation path`

Related earlier local commit in same work session  
`93ab490` — `feat(governance): add clear-expired-lease detection and recheck noop path`

Previous continuity commit  
`064ce77` — `docs(continuity): add operational launch packet for chat transitions`

Previous critical technical commit  
`24e0a4c` — `feat(governance): harden autonomous approval with recheck audit and rate limits`

Current repo note  
Repo is ahead of origin/main locally due to bounded `CLEAR_EXPIRED_LEASE` implementation work.  
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
No other action type is currently inside the **deployed** autonomous approval boundary.

## 3. Current Local Non-Live Expansion State

The following now exist locally but are not yet pushed/deployed:

- bounded `CLEAR_EXPIRED_LEASE` approval-path entry in `approve-autonomous-repair`
- Slice 1 stale-candidate detection against `repair_action_runs`
- Slice 2 approval-time recheck with fail-closed behavior
- explicit stale-lease event vocabulary:
  - `STALE_LEASE_CANDIDATE_IDENTIFIED`
  - `STALE_LEASE_CLEAR_RECHECK_FAILED`
- shared contract alignment for `CLEAR_EXPIRED_LEASE` to the locked stale `repair_action_runs` lease-anchor semantics
- new function:
  - `supabase/functions/propose-clear-expired-lease/index.ts`

Local bounded chain now exists:
1. propose stale-clear candidate
2. evaluate autonomous eligibility in shadow mode
3. approve through detection + approval-time recheck NOOP path

Important boundary  
This work is still intentionally:
- pre-deploy
- pre-push
- pre-mutation

No stale-terminal row mutation, stale-clear metadata writes, or executor mutation path for `CLEAR_EXPIRED_LEASE` have been introduced yet.

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
Deploy and prove the bounded `CLEAR_EXPIRED_LEASE` chain.

Goal  
Demonstrate the new bounded non-live path end-to-end:
1. `propose-clear-expired-lease` creates a valid structured proposal or reports that none is needed
2. `evaluate-autonomous-repair` marks the proposal eligible in shadow mode
3. `approve-autonomous-repair` passes through the `CLEAR_EXPIRED_LEASE` detection + approval-time recheck NOOP path or fails closed if drift is present

Why this is the next task  
The bounded local implementation has been completed and type-checked, but it has not yet been pushed, deployed, or proven remotely.

## 7. Exact Deploy Order For Next Task

Deploy in this order:

```bash
supabase functions deploy propose-clear-expired-lease --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy evaluate-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy approve-autonomous-repair --project-ref hwikvkhsujegdvuszlmc