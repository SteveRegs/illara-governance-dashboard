-- 20260307_idempotency_active_unique_index.sql
-- Ensure harness_run_requests idempotency only blocks active requests.

drop index if exists public.harness_run_requests_idempotency_key_uniq;
drop index if exists public.harness_run_requests_idempotency_key_uq;

create unique index if not exists harness_run_requests_idempotency_key_active_uniq
on public.harness_run_requests (idempotency_key)
where idempotency_key is not null
  and status in ('PENDING', 'APPROVED', 'EXECUTING');