Continuity Verification Checklist
Purpose
This checklist is used at the start of a new chat after a governed project handoff.
Its purpose is to confirm that continuity has actually transferred before meaningful work resumes.
For continuity-sensitive projects, no substantial work should begin until this checklist is explicitly passed.
This checklist is not a summary tool.
It is a verification gate.
Verification rule
A new chat must not proceed into coding, migrations, architectural changes, or regression work until the continuity packet has been checked against this verification list.
If verification is incomplete or weak:
stop
clarify the missing context
restate live assumptions
then continue only after continuity is restored
This is a fail-closed continuity policy.
Continuity Verification Checklist
1. Project Identity Check
Confirm all of the following:
 project name is correctly identified
 repo name is correctly identified
 Supabase project ref is correctly identified
 current primary branch is correctly identified
 latest pushed commit is correctly identified
 local vs remote commit state is correctly understood
 current repo cleanliness is correctly understood
Verification notes
[Write confirmation or corrections]
2. Live Scope Check
Confirm the current live operational scope.
 current live autonomous scope is correctly stated
 active allowlisted actions are correctly stated
 blocked/out-of-scope actions are correctly stated
 current autonomy tier is correctly stated
 current execution mode is correctly stated
 current rulepack version is correctly stated
 current approval actor identity is correctly stated
Verification notes
[Write confirmation or corrections]
3. Live Behavior Check
Confirm the system’s current proven behavior.
 shadow rejection behavior is correctly understood
 shadow eligibility behavior is correctly understood
 autonomous approval behavior is correctly understood
 approval-time recheck behavior is correctly understood
 fail-closed recheck-denial behavior is correctly understood
 cooldown behavior is correctly understood
 budget behavior is correctly understood, if live
 execution provenance behavior is correctly understood
 learning persistence behavior is correctly understood
Verification notes
[Write confirmation or corrections]
4. Critical Files Check
Confirm the new chat understands the current critical files.
 current function files are correctly identified
 current shared files are correctly identified
 current migration files are correctly identified
 current documentation files are correctly identified
 current sensitive/no-casual-edit files are correctly identified
Verification notes
[Write confirmation or corrections]
5. Migration / Database State Check
Confirm the current DB and migration posture.
 migration ledger state is correctly understood
 local/remote alignment status is correctly understood
 known direct SQL changes are correctly understood
 backup state is correctly understood
 any pending backup issues are correctly understood
Verification notes
[Write confirmation or corrections]
6. Proven Regression Check
Confirm the new chat understands what has actually been proven.
 proven positive-path regressions are correctly stated
 proven fail-closed regressions are correctly stated
 proven rate-limit regressions are correctly stated
 proven provenance continuity regressions are correctly stated
 unproven or pending items are correctly distinguished from proven ones
Verification notes
[Write confirmation or corrections]
7. Active Constants / Boundaries Check
Confirm the new chat understands current live constants and thresholds.
 current cooldown minutes are correctly stated
 current budget window is correctly stated
 current budget max per target is correctly stated
 current action allowlist is correctly stated
 current important rejection codes are correctly stated
 current important event types are correctly stated
 ordering assumptions are correctly understood
Verification notes
[Write confirmation or corrections]
8. Operational Commands Check
Confirm the new chat can work from known-good commands instead of assumptions.
 known-good env reload commands are available
 known-good deploy commands are available
 known-good migration commands are available
 known-good curl commands are available
 known-good SQL queries are available
 command/tool caveats are correctly understood
Verification notes
[Write confirmation or corrections]
9. Anti-Drift Check
Confirm the new chat understands the known trap areas.
 run_id vs proposal_id distinction is correctly understood
 local Docker vs remote Supabase distinction is correctly understood
 current secret/env caveats are correctly understood
 shadow eligibility vs approval-time legitimacy distinction is correctly understood
 cooldown-before-budget ordering is correctly understood
 current schema/migration caveats are correctly understood
Verification notes
[Write confirmation or corrections]
10. Current Open Work Check
Confirm the next chat is correctly anchored to the current work frontier.
 immediate next task is correctly identified
 secondary next task is correctly identified
 deferred work is correctly identified
 “do not touch casually” areas are correctly identified
Verification notes
[Write confirmation or corrections]
11. Resume Point Check
Confirm the exact point from which work should resume.
 current resume point is correctly restated
 first verification step is correctly identified
 first real operational task is correctly identified
Verification notes
[Write confirmation or corrections]
12. Confidence Assessment
Continuity confidence
 high
 medium
 low
Why this confidence level was chosen
[Write explanation]
If confidence is not high, what must be clarified first
[Write explanation]
Verification outcome
Status
 PASS — continuity sufficient, work may resume
 CONDITIONAL PASS — minor clarifications needed, low-risk work only
 FAIL — continuity insufficient, do not proceed into substantive work
Verified by
[Name / chat context]
Date
[Date]
Notes
[Write final verification notes]
Enforcement note
If this checklist does not pass, the correct behavior is not to improvise.
The correct behavior is:
pause
clarify
re-anchor from known-good continuity materials
then proceed
In this project, continuity failure is a governance risk.