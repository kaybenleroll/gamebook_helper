# Feature Development Workflow

Repeatable reference for implementing new features. Follow steps in order.

---

## 1. Skill Reference

| Skill | When to invoke | When NOT to invoke |
|-------|---------------|--------------------|
| `/grill-me` | Before creating any GitHub issue — resolves ambiguity, closes the design tree | Inside a subagent; inside plan mode; after issue already created |
| `/write-a-prd` | When the feature is large enough to need a structured spec with user stories and module design | Small, clearly-scoped bug fixes or one-liner enhancements |
| `/prd-to-issues` | After the PRD issue exists and is approved — breaks it into vertical slices | Before the PRD is written; before user approves the slice breakdown |
| `/stress-test` | After the slice breakdown draft is ready — Opus-level adversarial review before creating issues | After issues are already created and work has started |
| `/reflect` | After a session to process learnings into rules; retroactively after multiple sessions | During active implementation; as a substitute for writing proper rules |
| `/verify` | After implementation is complete — confirm feature works end-to-end in the running app | Before tests pass; as a substitute for running the full test suite |
| `/git-workflow` | Before any GitHub operation: creating issues, branching, committing, PRs, merges | After the PR is already merged |
| `/diagnose` | When something fails with no known root cause | Before exploring — explore first, diagnose when exploration doesn't resolve it |

---

## 2. Model Selection

Use the Agent tool's `model:` parameter to control subagent model. Default is Sonnet.

| Model | Use for |
|-------|---------|
| **Opus** | Complex reasoning: generating AND stress-testing slice breakdowns, architectural decisions, any task where harder thinking materially improves output |
| **Sonnet** | Default: implementation, research, exploration, PRD writing, codebase investigation, test runs |
| **Haiku** | Mechanical tasks only: creating formatted GitHub issues from an approved spec, running commands, label verification, reformatting output |

Key lesson: Opus should both generate and stress-test the slice breakdown — Sonnet is too agreeable with its own output to catch gaps. Opus caught a missing infrastructure slice, wrong HITL gates, and a race condition risk that Sonnet's first draft missed.

Model override syntax in the Agent tool call:

```
model: "opus"   # or "sonnet" or "haiku"
```

---

## 3. Full Feature Workflow

### Step 1 — Explore (Sonnet subagent)

Before asking the user anything, delegate codebase exploration to a Sonnet subagent. Look for:
- Existing data models, schema, migrations relevant to the feature
- Related API routes and service logic
- Existing UI patterns and components in the area
- CLAUDE.md, docs/, and prior PRs (via `git log`) for constraints

Cap subagent response at 150 words; write full findings to `.scratch/explore-<topic>.md`.

Never ask the user a question answerable from code.

### Step 2 — Clarify (grill-me, main thread only)

Run `/grill-me` in the main thread. grill-me requires interactive back-and-forth; it cannot run inside a subagent.

grill-me will:
1. Load exploration findings
2. List remaining open questions (exploration-derived answers never reach the user)
3. Ask one question at a time
4. Replay all decisions at the end

Do not create any GitHub issues until grill-me resolves the full design tree. The conversation IS the plan — skip a written plan doc when grill-me and stress-test have already closed ambiguity.

### Step 3 — Write the PRD (write-a-prd → GitHub issue)

Run `/write-a-prd`. The output is a **GitHub issue**, not a file. The issue contains:
- Problem statement and solution
- Numbered user stories (extensive)
- Implementation decisions (interfaces, schema changes, API contracts — no file paths)
- Testing decisions
- Out of scope

Do not use `/brainstorming` as a substitute — that skill produces a spec file, not a GitHub issue. They are different artefacts with different purposes.

### Step 4 — Stress-test the PRD (Opus subagent)

Before breaking into slices, run `/stress-test` as an Opus subagent against the PRD issue. Opus will find:
- Showstoppers: architectural mistakes requiring a rewrite
- Gaps: missing steps an implementer would have to guess
- Inconsistencies: conflicting decisions
- Underspecified areas: ambiguities that produce wrong implementations

Fix any showstoppers or gaps before proceeding. Stress-test is cheap; rework after issues are created is not.

### Step 5 — Break into slices (prd-to-issues, user approval, Haiku creates issues)

Run `/prd-to-issues` using an **Opus subagent**. Slice decomposition requires genuine reasoning about dependencies, granularity, and what's missing — Sonnet is too agreeable with its own output to catch gaps.

Present the breakdown to the user. For each slice show:
- Title, HITL/AFK classification, blockers, user stories covered

**Before creating issues:**
1. Run an **Opus subagent** to stress-test the slice breakdown adversarially
2. Get explicit user approval on the breakdown
3. Delegate issue creation to a **Haiku subagent** (mechanical formatting — no reasoning required)

Schema decisions that look like "later slices" (column additions, cross-entity relationships) must be in slice 1. Retrofitting schema is painful and breaks the vertical slice principle.

HITL gates belong on any slice requiring human aesthetic judgement (UX interactions, placement feel, snap feel) — not only on architectural decisions.

### Step 6 — Resolve open questions (one at a time)

Surface any questions that emerged during stress-test or slice review. Resolve them with the user one at a time before branching. Do not open a branch while questions remain open.

### Step 7 — Branch

Project-specific commands are defined in the project CLAUDE.md and `.claude/rules/`.

Working directory must be clean. If not: `git stash -u`, create branch, `git stash pop`.

### Step 8 — Implement (per-slice Sonnet subagents)

Delegate each slice to a Sonnet subagent. Before parallelising subagents, map which files each touches — tasks modifying the same file must be sequenced.

Every subagent that creates commits, branches, or PRs must receive the full contents of `.claude/rules/subagent-git.md` verbatim in its prompt. Subagents have no parent context and consistently miss `Closes #N`.

Project-specific test commands are defined in the project CLAUDE.md and `.claude/rules/`.

### Step 9 — Verify (/verify, main thread)

Run `/verify` after implementation is complete. Verify game-system-specific features end-to-end using that exact system — generic tests miss architecture violations (e.g., wrong stat field names per system).

Do not open a PR until:
- Type-checking passes (command defined in project CLAUDE.md)
- Full test suite passes (command defined in project CLAUDE.md)
- Feature is verified end-to-end

### Step 10 — PR and merge (git-workflow skill)

Run `/git-workflow` before creating the PR. Every PR body must contain `Closes #N` — one per line. Title references do not close issues.

Create PR and stop. Do not auto-merge — the user tests manually before merging.

---

## 4. Subagent Prompting Rules

**Always include in every subagent prompt:**
- `cwd:` set to the project root
- `owner:` and `repo:` for the GitHub repository

**For subagents that create commits, branches, or PRs:**
- Include the full contents of `.claude/rules/subagent-git.md` verbatim before the task description

**Response length discipline:**
- Cap every subagent at 150 words in its return message
- Full findings go to `.scratch/<filename>.md`
- Main thread reads the file only if a specific detail is needed later

**Parallel vs sequential:**
- Map which files each subagent modifies before parallelising
- Tasks touching the same file must be sequenced — overlapping writes cause merge conflicts
- Collect-all patterns exit before containers finish if any subagent completes early — use explicit per-subagent waits

**Do NOT use subagents for:**
- `/grill-me` — requires interactive back-and-forth with the user
- Long-running background tasks — use the main thread's Monitor/TaskOutput queue

**Model override syntax (Agent tool):**

```
model: "opus"   # or "sonnet" or "haiku"
```

---

## 5. Key Rules (learned from the map system session)

- **Always stress-test slice breakdowns with Opus before creating issues.** The first draft missed canvas infrastructure as its own slice; Opus caught it. Creating issues then discovering a missing slice forces mid-stream issue creation and breaks the dependency graph.

- **Right model at each step:** Sonnet generates, Opus reviews, Haiku executes. Don't use Sonnet for the review step — it is too agreeable with its own output.

- **grill-me cannot run in a subagent.** It requires interactive back-and-forth. Attempting this silently fails — Claude in a subagent has no user to ask.

- **write-a-prd produces a GitHub issue; brainstorming produces a spec file.** They are not interchangeable. The PRD issue is the canonical source of truth for prd-to-issues.

- **HITL gates are for aesthetic judgement, not only architecture.** Any slice where the output needs a human to say "this feels right" (snap behaviour, visual placement, UX flow) is HITL. Mark it explicitly or the slice ships without review.

- **Schema changes belong in slice 1.** Decisions that seem deferrable (cross-map edge columns, position fields) become blockers the moment a later slice needs them. Put them upfront.

- **Defer issue creation until exploration stabilises.** Incremental issue creation during rapid iteration forces rework and interrupts flow. Batch into one issue after the design is stable.

- **Verify `.scratch/` docs before including them in subagent prompts.** Staging docs drift during active refactors — command syntax and file paths go stale.
