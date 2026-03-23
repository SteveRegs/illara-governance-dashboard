Dashboard Stale-Clear Implementation Checklist v1
Purpose
This checklist converts the dashboard stale-clear interpretation spec into concrete implementation work.
It is intended to:
track progress clearly
reduce interpretation drift during implementation
separate required work from optional polish
provide a practical completion standard before reconsidering live rollout posture for CLEAR_EXPIRED_LEASE
This checklist is complete only when stale-cleared rows are correctly classified, rendered, and inspectable in the dashboard.
Working Objective
Implement dashboard behavior so that rows terminalized by CLEAR_EXPIRED_LEASE are shown as a distinct governed terminal-cleanup class rather than being misread as generic SKIPPED, success, or ambiguous state.
Canonical operator-facing meaning:
Stale Cleared
Lease expired; row terminalized without execution
Completion Standard
The checklist is complete only when all required items below are done and verified:
stale-cleared rows classify correctly
stale-cleared rows render as Stale Cleared
stale-cleared rows are not shown as successful execution
stale-cleared rows are not reduced to generic SKIPPED
stale-clear provenance is visible in row inspection/detail flows
null execution/verification truth is preserved
stale-cleared rows are not misclassified in summary/metrics views
Phase 1 — Discovery and Current-State Mapping
1.1 Identify current dashboard row rendering path
 Locate the UI component(s) that render repair_action_runs rows
 Identify where current status labels are derived
 Identify whether status logic is centralized or spread across multiple components
 Record the relevant file paths for row list/table rendering
 Record the relevant file paths for row detail/inspection rendering
1.2 Identify current status derivation logic
 Find the current logic that interprets approval_status
 Find the current logic that interprets execution_status
 Find the current logic that interprets verification_status
 Confirm whether terminal_reason is already used anywhere in rendering
 Confirm whether stale_clear is already surfaced anywhere in the UI
1.3 Identify current metrics/summary dependencies
 Locate any widgets, counters, or summaries that bucket repair action outcomes
 Identify whether SKIPPED currently flows into any misleading success/failure bucket
 Identify whether any tables or filters treat terminal rows generically
 Record the relevant file paths for summary/metrics logic
1.4 Capture baseline behavior before changes
 Document current stale-clear-related rendering behavior, even if incomplete
 Capture screenshots or notes for before-state comparison
 Confirm whether a stale-cleared synthetic row is already available for UI testing
 If not, identify how a known stale-cleared row will be used during implementation validation
Phase 2 — Derived Display Model Design
2.1 Create centralized display interpretation plan
 Decide where derived row display logic should live
 Prefer one centralized helper/mapping layer over repeated inline UI logic
 Choose a naming pattern for derived fields, such as:
 display_state
 display_label
 display_reason
 display_category
2.2 Define stale-clear precedence rules
 Add rule: if stale_clear = true, classify row as stale-cleared
 Add rule: if terminal_reason = LEASE_EXPIRED_CLEAR, classify row as stale-cleared
 Ensure stale-clear logic takes precedence over generic SKIPPED
 Ensure stale-clear logic takes precedence over fallback raw-status rendering
 Confirm precedence ordering against existing success/failure/pending logic
2.3 Define canonical display outputs
 display_state = stale_cleared
 display_label = "Stale Cleared"
 display_reason = "Lease expired; row terminalized without execution"
 display_category = "terminal_cleanup"
2.4 Define fallback behavior
 Ensure non-stale-clear rows continue existing interpretation behavior
 Ensure the new logic does not regress other row classes
 Ensure raw fallback still works for unknown future states
Phase 3 — List/Table View Implementation
3.1 Update row label rendering
 Modify row/table/list rendering to use derived display output
 Render stale-cleared rows as Stale Cleared
 Prevent stale-cleared rows from displaying only SKIPPED
 Prevent stale-cleared rows from visually resembling success rows
3.2 Add supporting explanation in compact form
 Add compact subtitle, tooltip, hover text, or supporting line where appropriate
 Recommended compact wording:
 Lease expired; no execution
 Confirm compact wording fits current UI density
3.3 Verify visual distinction
 Confirm stale-cleared rows are visually distinguishable from:
 executed success
 execution failure
 generic skipped rows
 pending rows
3.4 Check filters/sorts if applicable
 Confirm stale-cleared rows do not disappear from expected views
 Confirm filters do not incorrectly bucket them as success
 Confirm filters do not incorrectly bucket them as active failures
 Confirm sort behavior remains acceptable
Phase 4 — Detail / Inspection View Implementation
4.1 Add stale-clear summary in detail view
 Show top-level display state as Stale Cleared
 Show supporting explanation:
 Lease expired; row terminalized without execution
4.2 Expose terminal semantics
 Show Terminal reason: LEASE_EXPIRED_CLEAR
 Show Terminal reason version: v1
4.3 Expose raw state truth
 Show Approval status: SKIPPED
 Show Execution status: SKIPPED
 Show Verification status: UNKNOWN
4.4 Preserve null execution/verification truth
 Show Executed at as empty / dash / null-state indicator
 Show Verified at as empty / dash / null-state indicator
 Show Verification completed at as empty / dash / null-state indicator
 Confirm the UI does not imply execution occurred
4.5 Expose stale-clear provenance
 Show Stale cleared at
 Show Stale cleared by
 Show Stale clear proposal id
 Show Stale clear event id
4.6 Check layout clarity
 Confirm stale-clear details are readable and not buried
 Confirm raw fields support the interpretation rather than contradict it
 Confirm operator can understand the row without reading source code or SQL
Phase 5 — Event Trail / Audit View Review
5.1 Confirm audit path visibility
 Verify the row can be linked to or associated with event history
 Confirm stale-clear-related events appear as expected in audit views
 Confirm the audit view supports reconstruction of the stale-clear lifecycle
5.2 Confirm required stale-clear events are visible or queryable
 REPAIR_PROPOSAL_CREATED
 AUTO_APPROVAL_EVALUATION_STARTED
 AUTO_APPROVAL_ELIGIBLE
 STALE_LEASE_CANDIDATE_IDENTIFIED
 STALE_LEASE_CLEAR_APPROVED
 STALE_LEASE_CLEAR_EXECUTED
 STALE_LEASE_CLEAR_VERIFIED
5.3 Note any audit view gaps
 Record whether the dashboard already exposes these directly
 Record whether further audit-view improvements are needed later
 Distinguish “good enough for rollout gate” from “future enhancement”
Phase 6 — Metrics / Summary Classification Review
6.1 Identify metrics impact
 Review summary widgets and counters that use repair action status
 Identify where stale-cleared rows may currently be counted incorrectly
 Identify whether SKIPPED currently feeds misleading categories
6.2 Apply minimum safe classification
 Ensure stale-cleared rows are not counted as execution success
 Ensure stale-cleared rows are not counted as active failure
 Ensure stale-cleared rows are not counted as in-progress work
6.3 Add dedicated category if practical
 If the dashboard supports it cleanly, classify stale-clears as terminal cleanup
 If not, at minimum exclude them from misleading buckets
6.4 Verify summaries after implementation
 Confirm totals still make sense
 Confirm stale-cleared cases do not distort success/failure rates
 Confirm no visible regression in summary widgets
Phase 7 — Validation and Regression Review
7.1 Validate against known stale-cleared row
 Use a known synthetic proof row or equivalent test record
 Confirm list/table rendering says Stale Cleared
 Confirm detail view shows terminal semantics and provenance
 Confirm execution/verification null truth is preserved
7.2 Regression-check non-stale-clear rows
 Confirm normal success rows still render correctly
 Confirm normal failure rows still render correctly
 Confirm pending rows still render correctly
 Confirm generic skipped/non-stale rows still render correctly
7.3 Validate operator understanding
 Confirm an operator can answer:
 What happened?
 Was anything executed?
 Was anything verified?
 Why is the row terminal?
 What proposal/event path caused it?
 If any answer is unclear from the UI, implementation is not done
7.4 Capture after-state evidence
 Record screenshots or notes of final UI behavior
 Add implementation notes to continuity artifacts if needed
 Record any remaining gaps as explicitly deferred work
Phase 8 — Rollout Readiness Tie-In
This phase does not itself enable live mutation scope. It verifies that dashboard interpretation work is complete enough to satisfy the rollout gate dependency.
8.1 Confirm dashboard interpretation gate satisfaction
 stale-cleared rows are a distinct terminal class
 stale-cleared rows are not misread as success
 stale-cleared rows are not reduced to generic SKIPPED
 stale-clear provenance is visible in inspection flow
 stale-cleared rows are not misclassified in summaries
8.2 Record final posture statement
 Add/update continuity wording to reflect dashboard interpretation completion
 Keep rollout posture language precise
 Do not overstate live scope based on UI completion alone
Suggested Work Log Section
Use this section during implementation.
Current focus
 Phase 1
 Phase 2
 Phase 3
 Phase 4
 Phase 5
 Phase 6
 Phase 7
 Phase 8
Notes
 File paths identified
 Display helper location chosen
 Known stale-cleared test row identified
 Metrics review completed
 Regression review completed
Blockers
 None currently
 UI file ownership unclear
 No reliable stale-cleared row available for validation
 Metrics logic too distributed
 Audit linkage incomplete