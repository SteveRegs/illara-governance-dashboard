begin;

-- =========================================================
-- Autonomous Repair Tier 1 Baseline
-- Additive schema only
-- Purpose:
--   - structured repair intents
--   - explicit human vs auto approval metadata
--   - autonomous approval audit trail
-- =========================================================

-- ---------------------------------------------------------
-- 1) repair_proposals
-- ---------------------------------------------------------

alter table public.repair_proposals
  add column if not exists action_type text,
  add column if not exists target_kind text,
  add column if not exists target_id uuid,
  add column if not exists reason_code text,
  add column if not exists risk_class text,
  add column if not exists autonomy_tier_requested integer,
  add column if not exists is_structured_intent boolean not null default false,
  add column if not exists preconditions_json jsonb,
  add column if not exists verification_plan_json jsonb,
  add column if not exists proposal_evidence_json jsonb,
  add column if not exists rulepack_version text,
  add column if not exists auto_approval_eligible boolean,
  add column if not exists auto_approval_evaluated_at timestamptz,
  add column if not exists auto_approval_rejection_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_proposals_risk_class_check'
  ) then
    alter table public.repair_proposals
      add constraint repair_proposals_risk_class_check
      check (
        risk_class is null
        or risk_class in ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_proposals_autonomy_tier_requested_check'
  ) then
    alter table public.repair_proposals
      add constraint repair_proposals_autonomy_tier_requested_check
      check (
        autonomy_tier_requested is null
        or autonomy_tier_requested in (0, 1, 2, 3)
      );
  end if;
end $$;

create index if not exists idx_repair_proposals_structured_intent
  on public.repair_proposals (is_structured_intent, created_at desc);

create index if not exists idx_repair_proposals_action_type
  on public.repair_proposals (action_type, created_at desc);

create index if not exists idx_repair_proposals_target
  on public.repair_proposals (target_kind, target_id, created_at desc);

create index if not exists idx_repair_proposals_auto_eval
  on public.repair_proposals (auto_approval_eligible, auto_approval_evaluated_at desc);


-- ---------------------------------------------------------
-- 2) repair_action_runs
-- ---------------------------------------------------------

alter table public.repair_action_runs
  add column if not exists approval_mode text,
  add column if not exists approved_by_actor_type text,
  add column if not exists approved_by_actor_id text,
  add column if not exists autonomy_tier_used integer,
  add column if not exists verification_outcome text,
  add column if not exists verification_completed_at timestamptz,
  add column if not exists escalated_to_human boolean not null default false,
  add column if not exists escalation_reason_code text,
  add column if not exists rulepack_version text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_action_runs_approval_mode_check'
  ) then
    alter table public.repair_action_runs
      add constraint repair_action_runs_approval_mode_check
      check (
        approval_mode is null
        or approval_mode in ('HUMAN', 'AUTO')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_action_runs_approved_by_actor_type_check'
  ) then
    alter table public.repair_action_runs
      add constraint repair_action_runs_approved_by_actor_type_check
      check (
        approved_by_actor_type is null
        or approved_by_actor_type in ('HUMAN', 'SYSTEM')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_action_runs_autonomy_tier_used_check'
  ) then
    alter table public.repair_action_runs
      add constraint repair_action_runs_autonomy_tier_used_check
      check (
        autonomy_tier_used is null
        or autonomy_tier_used in (0, 1, 2, 3)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_action_runs_verification_outcome_check'
  ) then
    alter table public.repair_action_runs
      add constraint repair_action_runs_verification_outcome_check
      check (
        verification_outcome is null
        or verification_outcome in (
          'VERIFIED_SUCCESS',
          'VERIFIED_FAILURE',
          'VERIFICATION_INCONCLUSIVE',
          'VERIFICATION_TIMED_OUT'
        )
      );
  end if;
end $$;

create index if not exists idx_repair_action_runs_approval_mode
  on public.repair_action_runs (approval_mode, requested_at desc);

create index if not exists idx_repair_action_runs_autonomy_tier
  on public.repair_action_runs (autonomy_tier_used, requested_at desc);

create index if not exists idx_repair_action_runs_escalated
  on public.repair_action_runs (escalated_to_human, requested_at desc);

-- ---------------------------------------------------------
-- 3) learning_records
-- Add only if table exists
-- ---------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'learning_records'
  ) then
    alter table public.learning_records
      add column if not exists action_type text,
      add column if not exists target_kind text,
      add column if not exists target_id uuid,
      add column if not exists proposal_reason_code text,
      add column if not exists precondition_snapshot_json jsonb,
      add column if not exists verification_outcome text,
      add column if not exists escalation_required boolean,
      add column if not exists retry_count integer,
      add column if not exists rulepack_version text,
      add column if not exists autonomy_tier_used integer;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'learning_records'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'learning_records_verification_outcome_check'
  ) then
    alter table public.learning_records
      add constraint learning_records_verification_outcome_check
      check (
        verification_outcome is null
        or verification_outcome in (
          'VERIFIED_SUCCESS',
          'VERIFIED_FAILURE',
          'VERIFICATION_INCONCLUSIVE',
          'VERIFICATION_TIMED_OUT'
        )
      );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'learning_records'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'learning_records_autonomy_tier_used_check'
  ) then
    alter table public.learning_records
      add constraint learning_records_autonomy_tier_used_check
      check (
        autonomy_tier_used is null
        or autonomy_tier_used in (0, 1, 2, 3)
      );
  end if;
end $$;


-- ---------------------------------------------------------
-- 4) repair_approval_events
-- Dedicated audit trail for autonomous/human repair approval path
-- ---------------------------------------------------------

create table if not exists public.repair_approval_events (
  id uuid primary key default gen_random_uuid(),
  repair_proposal_id uuid not null references public.repair_proposals(id) on delete cascade,
  repair_action_run_id uuid references public.repair_action_runs(id) on delete set null,
  event_type text not null,
  actor_type text not null,
  actor_id text not null,
  action_type text,
  target_kind text,
  target_id uuid,
  autonomy_tier integer,
  rulepack_version text,
  eligibility_result text,
  rejection_reason_code text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_approval_events_actor_type_check'
  ) then
    alter table public.repair_approval_events
      add constraint repair_approval_events_actor_type_check
      check (
        actor_type in ('HUMAN', 'SYSTEM')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_approval_events_autonomy_tier_check'
  ) then
    alter table public.repair_approval_events
      add constraint repair_approval_events_autonomy_tier_check
      check (
        autonomy_tier is null
        or autonomy_tier in (0, 1, 2, 3)
      );
  end if;
end $$;

create index if not exists idx_repair_approval_events_proposal
  on public.repair_approval_events (repair_proposal_id, created_at desc);

create index if not exists idx_repair_approval_events_run
  on public.repair_approval_events (repair_action_run_id, created_at desc);

create index if not exists idx_repair_approval_events_type
  on public.repair_approval_events (event_type, created_at desc);

create index if not exists idx_repair_approval_events_target
  on public.repair_approval_events (target_kind, target_id, created_at desc);


-- ---------------------------------------------------------
-- 5) documentation comments
-- ---------------------------------------------------------

comment on column public.repair_proposals.is_structured_intent is
  'True only when the proposal contains a fully structured repair intent eligible for machine evaluation.';

comment on column public.repair_proposals.action_type is
  'Allowlisted repair action type for structured autonomous evaluation.';

comment on column public.repair_action_runs.approval_mode is
  'Indicates whether the repair action was approved by a HUMAN or by AUTO policy evaluation.';

comment on table public.repair_approval_events is
  'Explicit audit trail for repair approval evaluation, autonomous decisions, and escalation.';

commit;