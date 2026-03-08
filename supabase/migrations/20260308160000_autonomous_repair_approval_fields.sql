begin;

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

commit;