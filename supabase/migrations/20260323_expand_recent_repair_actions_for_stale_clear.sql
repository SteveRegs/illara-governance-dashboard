create or replace view public.repair_action_runs_recent_v1
with (security_invoker = true, security_barrier = true) as
select
  requested_at,
  action_type,
  coalesce((metadata ->> 'max_severity'), (metadata ->> 'failure_severity'), '—') as max_severity,
  approval_status,
  execution_status,
  verification_status,
  coalesce((metadata ->> 'run_label'), (metadata ->> 'label'), '—') as run_label,
  stale_clear,
  terminal_reason,
  terminal_reason_version,
  stale_cleared_at,
  stale_cleared_by,
  stale_clear_proposal_id,
  stale_clear_event_id
from public.repair_action_runs
order by requested_at desc;

drop function if exists public.public_get_repair_actions_recent(integer);

create function public.public_get_repair_actions_recent(limit_count integer default 25)
returns table(
  requested_at timestamptz,
  action_type text,
  max_severity text,
  approval_status text,
  execution_status text,
  verification_status text,
  run_label text,
  stale_clear boolean,
  terminal_reason text,
  terminal_reason_version text,
  stale_cleared_at timestamptz,
  stale_cleared_by text,
  stale_clear_proposal_id uuid,
  stale_clear_event_id uuid
)
language sql
security definer
set search_path to 'public'
as $$
  select
    requested_at,
    action_type::text,
    max_severity::text,
    approval_status::text,
    execution_status::text,
    verification_status::text,
    run_label::text,
    stale_clear,
    terminal_reason::text,
    terminal_reason_version::text,
    stale_cleared_at,
    stale_cleared_by::text,
    stale_clear_proposal_id,
    stale_clear_event_id
  from public.repair_action_runs_recent_v1
  order by requested_at desc
  limit limit_count;
$$;

grant all on function public.public_get_repair_actions_recent(integer) to anon;
grant all on function public.public_get_repair_actions_recent(integer) to authenticated;
grant all on function public.public_get_repair_actions_recent(integer) to service_role;