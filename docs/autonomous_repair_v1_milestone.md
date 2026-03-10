Autonomous Repair v1 Milestone
Status
Achieved
Date
2026-03-08
Project
Illara Governance Dashboard
Supabase project ref: hwikvkhsujegdvuszlmc
Summary
This milestone marks the first successful end-to-end implementation of bounded autonomous repair approval and execution inside the Illara Governance Dashboard.
The system can now:
evaluate a repair proposal against a constrained Tier 1 autonomy envelope
reject proposals outside that envelope with explicit reason codes
recognize proposals inside that envelope as eligible
autonomously approve a proposal within a tightly scoped rulepack
execute through the governed repair path
preserve autonomous provenance through execution, verification, and learning
maintain an explicit audit trail across the full lifecycle
This is the first point at which the governance system moved from propose-and-observe only to limited self-authorization within chartered boundaries.
Why this milestone matters
The importance of this milestone is not that the system “became autonomous” in a broad sense.
The importance is that the system now demonstrates procedurally legitimate bounded autonomy.
It does not act because it is “confident.”
It does not act because it “feels correct.”
It acts only when:
the proposal is structured
the action type is explicitly allowlisted
the risk class is constrained
the autonomy tier is explicit
the rulepack version matches
the proposal has already passed shadow eligibility checks
the resulting action remains within a narrow governance envelope
This is a foundational shift from:
observation and recommendation
to:
constrained self-authorization under governance
What was proven
1. Human approval metadata spine works
The human repair path was upgraded so that approval provenance now flows through the system in a structured way.
Proven live:
approve-repair-proposal records approval decisions cleanly
execute-repair-proposal writes approval metadata into repair_action_runs
repair_approval_events records approval and execution-related lifecycle events
learning_records preserve approval-context fields for downstream analysis
2. Shadow rejection path works
The system can evaluate an unstructured proposal in shadow mode and reject it correctly.
Proven live:
proposal remains in PROPOSED
evaluator writes:
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_REJECTED
proposal row records:
auto_approval_eligible = false
auto_approval_rejection_code = UNSTRUCTURED_PROPOSAL
3. Shadow eligibility path works
The system can evaluate a structured Tier 1 proposal in shadow mode and mark it eligible.
Proven live:
structured proposal was shaped with:
action_type = RERUN_HARNESS_VERIFICATION
risk_class = LOW
autonomy_tier_requested = 1
rulepack_version = tier1-safe-ops-v1
evaluator wrote:
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
proposal row recorded:
auto_approval_eligible = true
auto_approval_rejection_code = null
4. Autonomous approval works
The system can autonomously approve an eligible structured proposal inside the Tier 1 boundary.
Proven live:
proposal moved from PROPOSED to APPROVED
proposal row recorded:
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
event trail recorded:
AUTO_APPROVED
5. Autonomous execution provenance works
The execution layer was patched so that it no longer assumes human provenance.
Proven live:
an autonomously approved proposal executed through execute-repair-proposal
the resulting repair_action_runs row preserved:
approval_mode = AUTO
approved_by_actor_type = SYSTEM
approved_by_actor_id = autonomous-repair-approver-v1
autonomy_tier_used = 1
rulepack_version = tier1-safe-ops-v1
6. Verification and learning preserve autonomous context
The autonomous lane now carries through to verification and learning.
Proven live:
verification outcome persisted to repair_action_runs
repair_approval_events recorded VERIFICATION_COMPLETED
learning_records preserved:
action_type
proposal_reason_code
verification_outcome
rulepack_version
autonomy_tier_used
Current live Tier 1 boundary
Autonomous approval currently allowed for
RERUN_HARNESS_VERIFICATION
Required conditions
proposal must be in PROPOSED
proposal must be structured
auto_approval_eligible = true
risk_class = LOW
autonomy_tier_requested = 1
rulepack_version = tier1-safe-ops-v1
proposal must not carry a rejection code
Current execution mode
NOOP only
Current approval actor
autonomous-repair-approver-v1
Current autonomy tier
1
What remains intentionally blocked
The system does not currently allow autonomous approval of:
schema or migration changes
RLS or policy changes
privilege or credential changes
secret or environment changes
destructive actions
external service actions
freeform repair prose
unstructured proposals
medium/high/unknown risk proposals
action types outside the live allowlist
automatic expansion of its own autonomy scope
direct execution from shadow evaluation
Governance design principles validated by this milestone
Procedural legitimacy over open discretion
The system is not trusted because it is generally intelligent.
It is trusted because it is constrained by explicit rules and bounded surfaces.
Structured intent over prose
The system does not autonomously approve vague repair language.
It acts only on machine-checkable structured intent.
Approval and execution remain separate
The system’s approval decision and repair execution remain distinct stages.
This preserves auditability and reduces blast radius.
Fail-closed posture
When the proposal does not meet the envelope, the system rejects or defers.
It does not improvise.
Provenance continuity
Approval provenance now survives all the way through:
proposal
action run
approval events
verification
learning
Key database and system changes involved
Schema additions
Added structured repair and autonomous approval support across:
repair_proposals
repair_action_runs
learning_records
repair_approval_events
Trigger hardening
enforce_repair_proposal_immutability() was refined so that:
proposals remain immutable after creation by default
proposal shaping fields may be updated while status remains PROPOSED
decision/evaluation fields remain mutable as legitimate lifecycle fields
New functions introduced
evaluate-autonomous-repair
approve-autonomous-repair
Existing functions refined
approve-repair-proposal
execute-repair-proposal
Event lifecycle now demonstrated
The following event sequence was proven in live testing for the autonomous lane:
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_ELIGIBLE
AUTO_APPROVED
REPAIR_EXECUTION_STARTED
VERIFICATION_COMPLETED
In the rejection path, the following was proven:
AUTO_APPROVAL_EVALUATION_STARTED
AUTO_APPROVAL_REJECTED
Hardening update after milestone
Post-milestone hardening has now proven the autonomous approval recheck and rate-limit layers in live behavior.

Newly proven after the core milestone
1. Approval-time recheck works
The system does not rely blindly on prior shadow eligibility.
At approval time it re-validates that the proposal still satisfies the Tier 1 structured contract and writes:
AUTO_APPROVAL_RECHECK_FAILED
when legitimacy has drifted.

2. Cooldown denial works
The autonomous approval gate correctly denies an otherwise valid proposal when the same target is still inside the active cooldown window.
Proven live:
AUTO_APPROVAL_RATE_LIMITED
rejection_reason_code = AUTO_APPROVAL_COOLDOWN_ACTIVE

3. Budget denial works
The autonomous approval gate correctly denies an otherwise valid proposal when the per-target rolling 24-hour budget has already been exhausted.
Proven live:
AUTO_APPROVAL_RATE_LIMITED
rejection_reason_code = AUTO_APPROVAL_BUDGET_EXCEEDED

Observed approval response for pure budget denial
{"error":"Autonomous approval budget exceeded","budget_window_hours":24,"budget_max_per_target":3,"approvals_in_window":3}

What this hardening update means
The autonomous approval lane has now been live-validated across:
shadow rejection
shadow eligibility
approval-time recheck failure
autonomous approval success
cooldown denial
budget denial
execution provenance continuity
verification continuity
learning continuity

This closes the earlier proof gap around budget-trigger denial and confirms that the rate-limit stack fails closed at both currently implemented layers:
cooldown
rolling budget
Decision
Rate-limited denials remain event/audit-only.
Cooldown and budget denials do not mutate proposal-level denial state.
Rationale:
rate limiting is an operational throttle, not a structural illegitimacy marker.
Rate-limit state decision
Rate-limited denials remain event/audit-only.
Cooldown and budget denials do not mutate proposal-level denial state.

Why this matters
A cooldown or budget denial does not mean the proposal is structurally invalid.
It means the proposal is not approvable at that moment under current runtime throttling.
The proposal row therefore continues to represent structural/decision state, while runtime denial history remains in the event trail.
Known limitations
This milestone does not yet include:
per-action deep precondition engines beyond the current structured-envelope checks
autonomous execution for any action type beyond the current scoped test path
non-NOOP execution behavior
automatic structured proposal generation directly from all relevant harness failure patterns
autonomous handling for CLEAR_EXPIRED_LEASE
autonomous handling for REQUEUE_HARNESS_REQUEST
autonomous handling for RESET_REQUEST_TO_PENDING
Stability conclusion
The system has reached a stable and meaningful first autonomous milestone, but it should still be treated as Tier 1 bounded autonomy under active stabilization.
The correct next posture is:
document
reconcile migrations
create regression tests
harden
then expand slowly
Not:
add more action types immediately
broaden discretion quickly
collapse approval and execution into one step
Recommended next phase
Phase name
Hardening and Codification v1
Recommended tasks
capture all live SQL refinements in tracked migrations
create a regression runbook
freeze and document the current Tier 1 boundary
confirm repo/schema alignment
only then consider expanding the allowlist
Most likely next candidate
CLEAR_EXPIRED_LEASE
But only after the current v1 boundary is fully stabilized and reproducible.
Suggested external framing notes
When introducing this governance system externally, the most important point is not “our system can self-approve repairs.”
The stronger and more responsible framing is:
Illara’s governance layer enables bounded, auditable, chartered self-authorization inside explicitly defined operational envelopes.
Or more plainly:
The system can take limited corrective action on its own, but only when the action is pre-structured, low-risk, rule-bound, and fully observable.
The real differentiator is not autonomy alone.
It is governed autonomy.
Final statement
This milestone represents the first successful implementation of bounded autonomous repair approval in the Illara Governance Dashboard.
The system can now:
reject illegitimate repair proposals,
recognize legitimate ones,
approve within a narrow charter,
execute through an audited path,
and preserve provenance through verification and learning.
This is the beginning of a governed autonomy architecture built not on vague model confidence, but on explicit rules, constrained surfaces, and observable legitimacy.