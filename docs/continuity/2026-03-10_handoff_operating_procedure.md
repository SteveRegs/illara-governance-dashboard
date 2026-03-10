Handoff Operating Procedure
Purpose
This procedure defines how chat-to-chat project transitions are handled for the Illara Governance Dashboard and related continuity-sensitive work.
The goal is to prevent drift, loss of operational context, malformed follow-on work, and governance degradation caused by incomplete handoffs.
At the current level of project complexity, a handoff is not treated as a casual summary. It is treated as an operational transition boundary that must be governed explicitly.
Why this procedure exists
Earlier handoff practice relied mainly on:
summary of recent work
brief description of next steps
kickoff prompt for the next chat
That approach is no longer sufficient for this project.
The current system includes:
evolving live operational scope
bounded autonomous approval logic
approval-time recheck behavior
cooldown/rate-limit behavior
migration-state dependencies
function-level provenance requirements
known-good commands and SQL sequences
sensitive distinctions between similarly named ids and states
A weak handoff at this stage can introduce:
state drift
incorrect assumptions
malformed commands
misinterpretation of current live behavior
broken regression paths
governance inconsistencies
This procedure exists to reduce those risks.
Core principle
A handoff is a governed transition.
No new chat should resume meaningful project work until continuity has been explicitly transferred and verified.
This means:
summary alone is not enough
the new chat must confirm operational understanding
continuity must be checked before work resumes
Scope
This procedure applies whenever a chat is being transitioned because of:
thread length
latency
performance degradation
deliberate checkpointing
workstream separation
risk of losing operational continuity
This procedure is especially required for:
governance logic
autonomous approval logic
migrations and schema state
function behavior changes
regression proof tracking
multi-session architectural work
Required handoff artifacts
Every governed transition must produce the following artifacts.
1. Continuity Packet
This is the primary transfer document.
It captures:
current live system state
current validated behavior
critical operational facts
current boundaries and invariants
exact next-step context
The Continuity Packet is the main institutional memory artifact for the transition.
2. Continuity Verification Checklist
This is the anti-drift gate for the next chat.
It is used by the new chat to confirm:
correct project identity
correct live scope
correct operational understanding
correct next-step readiness
No substantial work should begin until this checklist is explicitly passed.
3. Session Delta
This is the short record of what changed in the most recent session.
It captures:
what changed
what was deployed
what was proven
what remains open
where work should resume
The Session Delta prevents the larger Continuity Packet from becoming overloaded with recent-session detail.
4. Kickoff Message
This is the short operational resume prompt pasted into the new chat after the artifacts.
It tells the new chat:
what phase the project is in
what the immediate task is
what assumptions must be preserved
Transition phases
A governed chat transition is performed in five phases.
Phase 1 — Pre-handoff stabilization
Before producing handoff materials, the current chat should be brought to a stable boundary.
Required actions
stop active exploratory debugging if possible
stop at a clean task boundary, not mid-edit
identify whether current work is at:
stable checkpoint
known failure point
incomplete partial implementation
confirm repo state as appropriate:
current branch
latest commit state
uncommitted files if relevant
confirm migration state if relevant
note deployment state if relevant
note backup state if relevant
Desired result
The project should be handed off from a known operational posture, not from a state of ambiguity.
Phase 2 — Artifact production
Once the current state is stable enough for transfer, the required handoff artifacts must be produced.
Required artifacts
Continuity Packet
Session Delta
Kickoff Message
Recommended update behavior
reuse the current dated continuity documents when appropriate
create new dated continuity packet instances for major transition points
preserve historical continuity records for later reference
Required quality standard
Artifacts must prioritize:
explicitness over brevity
accuracy over elegance
operational usefulness over narrative polish
If a detail is necessary for continuity, include it.
Phase 3 — New chat entry
When opening the new chat, paste artifacts in this order:
Required order
Continuity Packet
Session Delta
Kickoff Message
Reason for this order
The new chat needs:
full system state first
latest changes second
immediate operational task third
This order minimizes the risk that the new chat locks onto only the most recent detail without understanding the broader state.
Phase 4 — Continuity verification gate
Before real work resumes, the new chat must explicitly verify continuity.
This is not optional for continuity-sensitive work.
The new chat must confirm
correct project identity
current live autonomous scope
current validated behaviors
current active boundaries and guardrails
current critical files
current migration/ledger state if relevant
exact next task
Rule
No major coding, migration, architecture, or governance work should proceed until the new chat passes the continuity verification step.
If verification fails
If the new chat does not demonstrate sufficient continuity:
stop
correct the continuity packet
clarify the missing operational context
do not proceed on assumption
This is a fail-closed policy for handoffs.
Phase 5 — Work resumption
Only after continuity is confirmed should real work resume.
First task after verification should be one of:
previously defined next task
continuity sanity check
planned regression proof
planned hardening step
First task should not be
broad re-interpretation of the whole project
speculative redesign
unrelated new initiative
assumption-driven implementation
The first task after handoff should reinforce continuity, not destabilize it.
Required contents of a continuity packet
Every Continuity Packet must contain at least the following sections.
1. Project identity
project name
repo name
Supabase project ref
branch
latest pushed commit
latest local commit if different
2. Current live scope
what functionality is live now
active allowlist
blocked functionality
current autonomy tier
current execution mode
current rulepack version
3. Current validated behavior
positive path behavior
fail-closed behavior
shadow evaluation behavior
approval-time recheck behavior
cooldown/budget behavior if live
execution provenance behavior
learning persistence behavior
4. Critical files
current function files
shared files
key migrations
key docs
any sensitive file that should not be modified casually
5. Database and migration state
migration ledger alignment status
known direct-SQL changes if any
pending codification issues if any
backup state
6. Proven regressions and validations
Only include what has actually been proven.
7. Active constants and boundaries
Examples:
allowlisted action types
cooldown minutes
budget window
budget max
current rejection codes
current event types
8. Known-good operational commands and SQL
This is required for high-complexity work.
Include:
known-good curls
known-good SQL checks
known-good env reload commands
known-good migration commands where relevant
9. Known traps / anti-drift notes
Examples:
confusing run_id with proposal_id
local Docker vs remote project confusion
secret naming pitfalls
event ordering assumptions
rate-limit ordering assumptions
10. Next recommended work
immediate next step
fallback next step
explicitly deferred work
areas not to touch casually
Required contents of a session delta
Each Session Delta should contain:
1. Session date
2. What changed
3. What was deployed
4. What was proven
5. What remains open
6. Exact resume point
The Session Delta should be concise, but precise.
Verification standard for the new chat
The new chat does not need to reproduce every detail verbatim, but it must demonstrate operational continuity.
Minimum acceptable verification behavior
The new chat should be able to correctly restate:
what the live system currently does
what the current autonomous boundary is
what the current hardening state is
what the next task is
what key traps must be avoided
Verification failure examples
Examples of failed continuity:
confusing run ids and proposal ids
proposing commands inconsistent with current live schema
ignoring current live hardening behavior
assuming deprecated function behavior
missing active allowlist boundaries
resuming work from stale assumptions
If any of these appear, continuity has not been properly transferred yet.
Anti-drift policy
When continuity is uncertain, the procedure is:
stop
verify
restate live assumptions
re-anchor from known-good state
then proceed
Never continue by improvising over uncertainty in continuity-sensitive work.
Recommended file strategy
Continuity artifacts should be stored under:
docs/continuity/
Recommended dated naming:
YYYY-MM-DD_handoff_operating_procedure.md
YYYY-MM-DD_continuity_packet_template.md
YYYY-MM-DD_continuity_verification_checklist.md
YYYY-MM-DD_continuity_packet.md
YYYY-MM-DD_session_delta.md
This preserves historical reference points and reduces ambiguity.
Maintenance rule
The handoff procedure itself is a living governance document.
It should be revised when:
new continuity failure modes are discovered
project complexity materially increases
operational dependencies change
transfer friction reveals missing structure
Continuity procedure should evolve deliberately, not casually.
Final rule
For this project, continuity is part of governance.
A handoff that cannot preserve operational truth is not a neutral inconvenience.
It is a drift risk.
Therefore:
handoffs must be explicit
continuity must be verified
work must fail closed when continuity is uncertain
This procedure exists to make that practical.