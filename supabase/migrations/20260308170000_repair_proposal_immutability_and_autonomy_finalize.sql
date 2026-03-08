begin;

-- =========================================================
-- Repair proposal immutability + autonomous approval finalize
-- Purpose:
--   - finalize repair_proposals approval provenance fields
--   - codify final immutability behavior for:
--       * proposal shaping while PROPOSED
--       * decision/evaluation lifecycle updates post-creation
-- =========================================================

-- ---------------------------------------------------------
-- 1) repair_proposals autonomous approval provenance fields
-- ---------------------------------------------------------

alter table public.repair_proposals
  add column if not exists approval_mode text,
  add column if not exists approved_by_actor_type text,
  add column if not exists approved_by_actor_id text,
  add column if not exists autonomy_tier_used integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repair_proposals_approval_mode_check'
  ) then
    alter table public.repair_proposals
      add constraint repair_proposals_approval_mode_check
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
    where conname = 'repair_proposals_approved_by_actor_type_check'
  ) then
    alter table public.repair_proposals
      add constraint repair_proposals_approved_by_actor_type_check
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
    where conname = 'repair_proposals_autonomy_tier_used_check'
  ) then
    alter table public.repair_proposals
      add constraint repair_proposals_autonomy_tier_used_check
      check (
        autonomy_tier_used is null
        or autonomy_tier_used in (0, 1, 2, 3)
      );
  end if;
end $$;

comment on column public.repair_proposals.approval_mode is
  'HUMAN or AUTO approval provenance for the proposal decision.';
comment on column public.repair_proposals.approved_by_actor_type is
  'HUMAN or SYSTEM actor type that approved the proposal.';
comment on column public.repair_proposals.approved_by_actor_id is
  'Specific actor id that approved the proposal.';
comment on column public.repair_proposals.autonomy_tier_used is
  'Autonomy tier actually used at approval time, if any.';

-- ---------------------------------------------------------
-- 2) finalize immutability trigger function
-- ---------------------------------------------------------
-- Behavior:
--   - proposals are immutable by default after creation
--   - while status remains PROPOSED, proposal-shaping fields may be updated
--   - decision/evaluation/provenance fields may be updated as lifecycle fields
-- ---------------------------------------------------------

create or replace function public.enforce_repair_proposal_immutability()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
declare
  always_allowed_fields text[] := array[
    'proposal_status',
    'decided_at',
    'decided_by',
    'decision_reason',
    'approval_mode',
    'approved_by_actor_type',
    'approved_by_actor_id',
    'autonomy_tier_used',
    'auto_approval_eligible',
    'auto_approval_evaluated_at',
    'auto_approval_rejection_code',
    'rulepack_version'
  ];

  proposed_only_allowed_fields text[] := array[
    'action_type',
    'target_kind',
    'target_id',
    'reason_code',
    'risk_class',
    'autonomy_tier_requested',
    'is_structured_intent',
    'preconditions_json',
    'verification_plan_json',
    'proposal_evidence_json'
  ];
begin
  if old.proposal_status = 'PROPOSED' and new.proposal_status = 'PROPOSED' then
    if
      (
        to_jsonb(new) - (always_allowed_fields || proposed_only_allowed_fields)
      )
      is distinct from
      (
        to_jsonb(old) - (always_allowed_fields || proposed_only_allowed_fields)
      )
    then
      raise exception
        'repair_proposals are immutable after creation except for proposal shaping while PROPOSED and decision/evaluation fields';
    end if;

    return new;
  end if;

  if
    (
      to_jsonb(new) - always_allowed_fields
    )
    is distinct from
    (
      to_jsonb(old) - always_allowed_fields
    )
  then
    raise exception
      'repair_proposals are immutable after creation except for decision/evaluation fields';
  end if;

  return new;
end;
$function$;

comment on function public.enforce_repair_proposal_immutability() is
  'Enforces immutable repair proposals after creation, with a bounded shaping window while PROPOSED and explicit lifecycle-field exceptions for decision/evaluation/provenance.';

commit;