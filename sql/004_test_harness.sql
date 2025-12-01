-- 004_test_harness.sql
-- Test harness base tables: test_runs + test_checks

-- 1) Top-level executions of the harness
create table if not exists public.test_runs (
  id uuid primary key default gen_random_uuid(),

  -- When this harness run started and finished
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,

  -- Overall status of the run: PENDING | PASS | FAIL
  overall_status text not null default 'PENDING',

  -- Environment: prod | staging | dev (string for now, can tighten later)
  environment text not null default 'prod',

  -- Which system this run was targeting (e.g. governance_dashboard, invyra, etc.)
  target_system text not null default 'governance_dashboard',

  -- Aggregates for the checks inside this run
  total_checks   integer not null default 0,
  failed_checks  integer not null default 0,

  -- High-level severity for the run: none | low | medium | high
  failure_severity text not null default 'none',

  -- Optional metadata (e.g. harness version, host info, etc.)
  meta jsonb not null default '{}'::jsonb
);

-- Helpful index: newest runs first by target_system
create index if not exists idx_test_runs_target_started
  on public.test_runs (target_system, started_at desc);


-- 2) Individual checks inside a harness run
create table if not exists public.test_checks (
  id uuid primary key default gen_random_uuid(),

  -- Link back to the parent run
  run_id uuid not null references public.test_runs(id) on delete cascade,

  -- Name of this check (e.g. supabase_ping, fetch_reports, pass_rate_consistency)
  check_name text not null,

  -- PASS | FAIL
  status text not null,

  -- low | medium | high (for now, string)
  severity text not null default 'low',

  -- Short human-readable message
  message text,

  -- Extra raw details (error objects, payloads, etc.)
  details jsonb,

  -- How long this check took
  duration_ms integer,

  -- When this check record was created
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_test_checks_run
  on public.test_checks (run_id);

create index if not exists idx_test_checks_created
  on public.test_checks (created_at desc);
