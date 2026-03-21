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
`CLEAR_EXPIRED_LEASE` is now deployed only in a bounded non-mutation proof posture.

## 3. Current Deployed Non-Live Expansion State

The following now exist in the current codebase and are now deployed remotely:

- bounded `CLEAR_EXPIRED_LEASE` approval-path entry in `approve-autonomous-repair`
- Slice 1 stale-candidate detection against `repair_action_runs`
- Slice 2 approval-time recheck with fail-closed behavior
- explicit stale-lease event vocabulary:
  - `STALE_LEASE_CANDIDATE_IDENTIFIED`
  - `STALE_LEASE_CLEAR_RECHECK_FAILED`
- shared contract alignment for `CLEAR_EXPIRED_LEASE` to the locked stale `repair_action_runs` lease-anchor semantics
- new function:
  - `supabase/functions/propose-clear-expired-lease/index.ts`

Remote bounded chain now exists:
1. propose stale-clear candidate
2. evaluate autonomous eligibility in shadow mode
3. approve through detection + approval-time recheck NOOP path

Important boundary  
This work is still intentionally:
- pre-mutation

No stale-terminal row mutation, stale-clear metadata writes, or executor mutation path for `CLEAR_EXPIRED_LEASE` have been introduced yet.

Remote bounded proof result  
The first remote proof call to `propose-clear-expired-lease` returned:
- `NO_STALE_CANDIDATE`

SQL verification confirmed:
- no rows matched the 48-hour stale-candidate criteria
- no near-miss rows existed in the approved / not-started / not-verified slice

This means the bounded proof stopped correctly because no eligible remote target exists right now.  
The full propose -> evaluate -> approve chain was not completed in remote because there was nothing valid to advance.

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
Decide how to obtain the next bounded remote proof opportunity for `CLEAR_EXPIRED_LEASE`.

Goal  
Choose one of the next two paths:
1. wait for a natural stale candidate in remote
2. design a controlled synthetic stale-candidate proof session

Why this is the next task  
The bounded implementation has now been deployed successfully, and the first remote proof stopped cleanly at `NO_STALE_CANDIDATE` because no eligible target exists.

Current checkpoint summary  
`CLEAR_EXPIRED_LEASE` now has:
- proposal generation
- shadow evaluation compatibility
- approval-time detection and recheck NOOP path
- successful deployment of:
  - `propose-clear-expired-lease`
  - `evaluate-autonomous-repair`
  - `approve-autonomous-repair`
- bounded remote proof showing correct no-target stop behavior

This checkpoint remains intentionally pre-mutation.  
It is partially proven remotely only to the extent that remote correctly reports no eligible stale target at present.

## 7. Exact Deploy Order For Latest Remote Proof

Completed on 2026-03-21 in this order:

```bash
supabase functions deploy propose-clear-expired-lease --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy evaluate-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
supabase functions deploy approve-autonomous-repair --project-ref hwikvkhsujegdvuszlmc
```

First bounded remote proof result after deploy:
- `propose-clear-expired-lease` returned `NO_STALE_CANDIDATE`
- proof stopped there by design because no eligible remote stale candidate existed
