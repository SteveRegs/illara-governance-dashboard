# Governance Schema Reconciliation — 2026-03-07

## Summary

The live governance schema predates the current tracked migration history in this repository.

At present, the committed migration history is not a full historical record of how the governance database evolved. The current live database contains substantial governance, approval, executor, repair, and audit structures that were implemented outside the currently tracked migration chain.

As of 2026-03-07, reconciliation is being performed from **live schema outward**, treating the live database as the current operational truth and documenting schema drift explicitly before applying further cleanup migrations.

The currently tracked migration baseline in `supabase/migrations/` begins effectively with:

- `20260307_idempotency_active_unique_index.sql`

## Core Live Governance Tables

The following core governance-related tables are confirmed present in the live `public` schema:

- `executor_invocations`
- `governance_reports`
- `harness_request_events`
- `harness_run_requests`
- `learning_records`
- `repair_execution_events`
- `repair_proposals`
- `test_checks`
- `test_runs`

## harness_run_requests — Current vs Legacy Field Classification

The `public.harness_run_requests` table is currently a hybrid of legacy and current lifecycle models.

### Current lifecycle fields

These fields align with the current approval → executor → completion architecture and should be treated as the active model:

- `id`
- `created_at`
- `source`
- `run_label`
- `requested_by`
- `request_ip`
- `status`
- `run_id`
- `approved_at`
- `approved_by`
- `approved_by_label`
- `approval_reason`
- `approval_note`
- `rejected_at`
- `rejected_by`
- `rejection_note`
- `requested_run_mode`
- `request_payload`
- `idempotency_key`
- `attempt_count`
- `claimed_at`
- `claimed_by`
- `lease_expires_at`
- `execution_started_at`
- `execution_finished_at`
- `completion_status`
- `completion_note`
- `error_code`
- `error_detail`

### Legacy residue fields

These fields appear to belong to an older lock/run model and are now candidates for forward cleanup, **but should not be dropped until code/view dependencies are audited**:

- `locked_at`
- `locked_by`
- `executor_started_at`
- `executor_finished_at`
- `lock_token`
- `lock_expires_at`
- `result`
- `error`

## Current Constraints of Note

The following live constraints are currently confirmed on `harness_run_requests`:

- `harness_run_requests_attempt_count_nonneg`
  - `CHECK (attempt_count >= 0)`
- `harness_run_requests_status_check_v2`
  - permits:
    - `PENDING`
    - `APPROVED`
    - `EXECUTING`
    - `COMPLETED`
    - `FAILED`
    - `REJECTED`
    - `CANCELLED`
- `hrr_completed_requires_run_id`
  - `COMPLETED` rows must have `run_id`

These align with the current lifecycle model.

## Current Index Situation

### Confirmed current/meaningful indexes

- `harness_run_requests_idempotency_key_active_uniq`
- `harness_run_requests_lease_expires_at_idx`
- `harness_run_requests_status_created_at_idx`
- `uniq_pending_harness_recheck`
- `harness_request_events_request_id_created_at_idx`

### Legacy or cleanup-candidate indexes

The live schema also contains indexes that appear to be residue from earlier phases:

- `idx_hrr_lock_expiry`
  - legacy because it references `status = 'RUNNING'`
- duplicate/overlapping status-created indexes, including:
  - `idx_harness_run_requests_status_created`
  - `idx_hrr_status_created_at`

These should be reviewed and rationalized in a forward cleanup migration.

## harness_request_events

The `public.harness_request_events` table exists live and functions as the append-only audit trail for governed request state transitions.

Current columns:

- `id`
- `created_at`
- `request_id`
- `event_type`
- `actor_type`
- `actor_id`
- `actor_label`
- `from_status`
- `to_status`
- `meta`

This table is consistent with the current governed lifecycle and should be retained as a core audit surface.

## Idempotency Correction Applied on 2026-03-07

A runtime-validated correction was made to ensure deterministic idempotency keys only block **active** requests rather than all historical requests.

The correct uniqueness scope is now:

- `PENDING`
- `APPROVED`
- `EXECUTING`

Terminal states such as:

- `CANCELLED`
- `REJECTED`
- `FAILED`
- `COMPLETED`

must not retain permanent exclusivity over a deterministic idempotency key.

This correction is captured in:

- `supabase/migrations/20260307_idempotency_active_unique_index.sql`

## Reconciliation Conclusions

1. The live governance schema is operationally coherent but historically under-documented in tracked migrations.
2. Future cleanup should proceed as **forward reconciliation**, not attempted reconstruction of perfect historical migration order.
3. The next safe cleanup targets are:
   - legacy `RUNNING`-era indexes
   - duplicate/overlapping indexes on `harness_run_requests`
4. Legacy lifecycle columns in `harness_run_requests` should only be removed after code, view, and reporting dependencies are audited.
5. From this point onward, all schema-affecting changes should be recorded in tracked migrations as part of normal governance discipline.

## Next Actions

- Audit codebase for references to legacy `harness_run_requests` fields:
  - `locked_at`
  - `locked_by`
  - `executor_started_at`
  - `executor_finished_at`
  - `lock_token`
  - `lock_expires_at`
  - `result`
  - `error`
- Audit schema objects/views for dependency on legacy indexes and fields.
- Create a forward cleanup migration to remove obsolete `RUNNING`-era indexes.
- Create a forward cleanup migration to rationalize duplicate status-created indexes.
- Later, create a forward cleanup migration for legacy columns if dependency audit confirms they are unused.