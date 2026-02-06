-- Phase C-2: Repair Approval Architecture
-- Applied via Supabase SQL editor (recorded here for reproducibility)

-- 1) Decision metadata columns
alter table public.repair_proposals
  add column if not exists decided_at timestamptz null,
  add column if not exists decided_by text null,
  add column if not exists decision_reason text null;

-- 2) Immutability trigger (content immutable; decision fields may change)
create or replace function public.enforce_repair_proposal_immutability()
returns trigger language plpgsql as $$
begin
  if (new.run_id is distinct from old.run_id)
     or (new.title is distinct from old.title)
     or (new.summary is distinct from old.summary)
     or (new.evidence is distinct from old.evidence)
     or (new.risk_assessment is distinct from old.risk_assessment)
     or (new.proposed_changes is distinct from old.proposed_changes)
     or (new.guardrails is distinct from old.guardrails)
     or (new.failure_severity is distinct from old.failure_severity)
     or (new.overall_status is distinct from old.overall_status)
     or (new.proposed_by is distinct from old.proposed_by)
     or (new.approval_required is distinct from old.approval_required)
  then
    raise exception 'repair_proposals content is immutable after creation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_repair_proposal_immutability on public.repair_proposals;

create trigger trg_enforce_repair_proposal_immutability
before update on public.repair_proposals
for each row
execute function public.enforce_repair_proposal_immutability();
