alter table public.repair_action_runs
  add column if not exists stale_clear boolean not null default false,
  add column if not exists stale_cleared_at timestamptz,
  add column if not exists stale_cleared_by text,
  add column if not exists stale_clear_proposal_id uuid,
  add column if not exists stale_clear_event_id uuid,
  add column if not exists terminal_reason text,
  add column if not exists terminal_reason_version text;

create index if not exists idx_repair_action_runs_stale_clear
  on public.repair_action_runs (stale_clear, requested_at desc);
