---
triggers:
  - "When starting any task"
  - "When delegating work"
  - "When using subagents"
  - "When reading files for research"
  - "When running bash commands"
---

# Claude Workflow Rules

## Subagent Delegation

Delegate ALL non-trivial work to subagents — research, exploration, implementation, test runs. Main thread orchestrates only; do not wait to be asked.

- **File reads for reference/research → Explore subagent** — inline reads accumulate context silently; Explore returns summaries, not full content.
- **Any grep/find/rg/fd → Explore subagent** — the main thread must not perform file discovery; delegate entire sequences, not individual commands.
- **Bash commands expected to return >20 lines → delegate to subagent**, return only relevant output.
- Subagents must run commands and show actual output — never claim results without running the command.
- **Before parallelising subagent tasks, map which files each modifies** — tasks touching the same file must be sequenced; overlapping writes cause merge conflicts.
- **Cap all subagent responses** — instruct every subagent: "report in under 150 words; write full findings to `.scratch/<filename>.md`." Read the file only when a specific detail is needed.
- **Establish shared definitions before handing off** — misaligned terms cause the subagent to analyse the wrong thing.
- When parallel subagents may outlive the main script, use explicit per-subagent waits — a collect-all pattern exits before containers finish if any subagent completes early.
- Do not trust a subagent's summary alone — read the file or run `git diff` before reporting complete.

## Subagent Git Operations

**When spawning a subagent for commits, branches, or PRs: include `.claude/rules/subagent-git.md` verbatim in the prompt** — subagents miss `Closes #N` without it.

- After parallel subagent merges, pull main and verify integrated state before dispatching the next round.
- Confirm the previous PR is merged and working directory is clean on main before starting the next task.
- Before creating a bug issue, check if an open PR already covers that code area — fold the fix into that branch instead.
- Verify working-directory state after subagent branch operations — branch switches affect the running dev server.

## GitHub and Just

- **Always use `gh` CLI for any `mcp__github__*` call involving arrays or numeric IDs.** Upstream SDK bug (anthropics/claude-code#18260) serialises these as strings.
- `just <target>` ignores the "Working directory" prompt field — always prefix with `cd /home/mcooney/workspace/gamebook_helper &&`.
- **Don't add overly-specific permission allowlist entries to solve `cd ... && just` prompt friction** — split the command into separate Bash calls instead.

## Workflow Sequencing

- **Run `grill-me` before creating the GitHub issue** — resolve ambiguity first; issue creation comes after.
- **Run grill-me in the main thread only** — it requires interactive back-and-forth with the user; cannot run inside a subagent.
- **Verify game-system-specific features end-to-end using that exact system** — generic tests miss architecture violations such as wrong stat field names per system.
- **Use /diagnose when something fails with no known root cause** — the issue emerges from the diagnosis; create it after, not before.
- **Defer issue creation and branching until exploration stabilises; batch as one issue** — incremental issue creation during rapid iteration interrupts flow.
- **Skip the written plan when grill-me and stress-test have closed ambiguity** — the conversation IS the plan.
- **Include naturally symmetric features in the same PR** — split PRs fragment design consistency and the counterpart rarely gets revisited.

## Scope Discipline

- **`/pcc` is decision support only** — present pros/cons/recommendation then stop; do not act until user directs.
- **Don't promote deferred backlog items to next action without explicit user confirmation** — scope decisions rest with the user.
- **Get explicit approval before spawning a subagent to build exploratory or demo UI** — propose the work, wait for yes.
- Do not suggest removing the `git push --force` permission gate — rebase friction is accepted in exchange for safety.
- **Long-running background tasks use the main thread's background queue (Monitor/TaskOutput), not subagents** — subagents exit after initiating without lifecycle awareness.
- Analyse systematic failures before re-running expensive experiments — re-collecting without prompt changes produces the same result.

## Codebase and File Hygiene

- **Spec files belong in git-tracked `docs/`**, not `.scratch/` — ephemeral staging loses version history.
- **Before assuming a file is active/stale/unused**, check git history, hooks, and compose files — script wiring may live in compose, not just Justfile.
- **Verify `.scratch/` docs against actual code before including in subagent prompts** — staging docs drift during refactors.
- **Name `.scratch/` handoff files `{topic}_handoff_YYYY-MM-DD.md`** — topic makes context findable, date surfaces staleness without opening the file.
- **Respect Chesterton's Fence** — file an issue before removing structure whose purpose isn't obvious.
