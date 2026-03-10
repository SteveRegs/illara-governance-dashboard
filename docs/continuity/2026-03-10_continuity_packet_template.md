Continuity Packet Template
Purpose
This template is used to create a full operational continuity packet when transitioning work between chats.
It is intended for continuity-sensitive projects where:
system behavior is evolving across sessions
live operational scope matters
exact commands and validated regressions matter
incomplete transfer can introduce drift or malformed work
This packet is not a casual summary.
It is a structured transfer artifact.
Continuity Packet
1. Project Identity
Project name
[Project name]
Repo name
[Repo name]
Supabase project ref
[Project ref]
Primary branch
[Branch name]
Latest pushed commit
[Commit hash and message]
Latest local commit if different
[Commit hash and message or “same as pushed”]
Current repo cleanliness
 clean working tree
 uncommitted changes present
 intentional untracked files present
Notes
[Anything important about repo state]
2. Current Phase
Current project phase
[Example: Autonomous Repair v1 hardening]
Short description
[One paragraph describing where the project is right now]
Current session boundary type
 stable checkpoint
 mid-hardening checkpoint
 failed test checkpoint
 migration checkpoint
 deployment checkpoint
 other: [describe]
3. Current Live Scope
Live autonomous scope
[List what is actually live right now]
Active allowlist
[List currently allowlisted actions]
Explicitly blocked / out of scope
[List what is intentionally not allowed]
Current autonomy tier
[Value]
Current execution mode
[Value]
Current rulepack version
[Value]
Current approval actor
[Value]
Current verification posture
[Describe]
4. Current Live Behavior
Describe what the system actually does right now.
Shadow evaluation behavior
[Describe positive and negative outcomes]
Autonomous approval behavior
[Describe approval conditions and fail-closed behavior]
Approval-time recheck behavior
[Describe what is revalidated at approval time]
Rate-limit behavior
[Describe cooldown and/or budget behavior if live]
Execution provenance behavior
[Describe how approval provenance flows into execution]
Verification behavior
[Describe]
Learning behavior
[Describe]
5. Current Active Constants and Boundaries
List exact live values and boundaries.
Allowlisted action types
[Action type]
[Action type]
Cooldown settings
cooldown minutes: [value]
Budget settings
budget window hours: [value]
budget max per target: [value]
Required structured fields
[List or describe]
Active rejection codes added recently
[List relevant codes]
Active event types added recently
[List relevant event types]
Known ordering assumptions
Example:
cooldown check runs before budget check
approval-time recheck runs after shadow eligibility
[Other ordering assumptions]
6. Current Critical Files
List the files that are currently operationally important.
Functions
[path]
[path]
Shared files
[path]
[path]
Migrations
[path]
[path]
Documentation
[path]
[path]
Sensitive files / caution files
[List any file that should not be modified casually]
7. Database and Migration State
Migration ledger status
 local and remote aligned
 known drift exists
 unknown / must verify
Current relevant migrations
[filename]
[filename]
[filename]
Known direct SQL changes not yet codified
[Describe or write “none known”]
Known trigger/function adjustments
[List any important DB-side logic changes]
Backup status
code backup: [status]
schema dump backup: [status]
notes: [details]
8. Validated Regression Proofs
Only include what has actually been proven.
Proven positive-path regressions
 [Description]
 [Description]
Proven fail-closed regressions
 [Description]
 [Description]
Proven rate-limit regressions
 [Description]
 [Description]
Proven provenance continuity regressions
 [Description]
Still unproven / pending
 [Description]
 [Description]
9. Known-Good Commands
This section is required for continuity-sensitive work.
Use exact commands that are known to work in this project.
Environment reload
[Known-good env reload command(s)]
Git safety commands
[Known-good git status/log/push commands]
Deploy commands
[Known-good supabase functions deploy commands]
Migration commands
[Known-good migration commands]
Backup commands
[Known-good backup commands]
Known-good curl commands
[Known-good curl command]
[Known-good curl command]
Notes
[Anything special about command usage]
10. Known-Good SQL Queries
This section is also required.
Proposal lookup query
[Known-good proposal lookup query]
Event trail query
[Known-good event trail query]
Action run query
[Known-good action run query]
Learning record query
[Known-good learning record query]
Rate-limit/budget query
[Known-good rate-limit or budget query]
Notes
[Anything special about interpreting these queries]
11. Known Useful IDs / Targets
Only include IDs that are still useful for active regression or interpretation.
Useful target ids
[id] — [what it represents]
Useful proposal ids
[id] — [why it matters]
Useful run ids
[id] — [why it matters]
Notes
[Clarify which ids are likely stale vs reusable]
12. Known Traps / Anti-Drift Notes
This section is mandatory.
List the things most likely to cause bad continuity.
Identity confusion risks
do not confuse run_id with proposal_id
[Other identity confusion risks]
Tooling/environment risks
supabase status is local/Docker-oriented
supabase db dump requires Docker in this environment
[Other tooling risks]
Secret/env risks
[Reserved secret behavior, env loading issues, etc.]
Behavioral interpretation risks
shadow eligibility is not the same as approval-time legitimacy
cooldown may block before budget
[Other interpretation risks]
Schema/migration risks
[Any active caveats]
13. Current Open Work
Immediate next task
[One exact next task]
Secondary next task
[Optional next task]
Explicitly deferred work
[Deferred item]
[Deferred item]
Things not to touch casually
[Sensitive area]
[Sensitive area]
14. Current Resume Point
Resume from here
[One concise paragraph stating exactly where work should restart]
First verification step in next chat
[What the new chat should confirm first]
First operational task after verification
[The first real task]
15. Continuity Confidence
Confidence that this packet is sufficient
 high
 medium
 low
Known weak spots in this packet
[Describe]
What should be checked first if continuity feels uncertain
[Describe]
16. Optional Attachments / References
Related docs
[path]
[path]
Related milestone docs
[path]
Related runbooks
[path]
Related migration files
[path]
Final note
This packet should make it possible for a new chat to resume work without inventing missing operational state.
If any critical continuity element is missing, that is not a minor omission.
It is a drift risk and should be corrected before substantial work resumes.