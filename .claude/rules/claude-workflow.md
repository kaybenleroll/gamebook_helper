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

- **File reads for reference/research (not editing) → delegate to Explore subagent regardless of count.** Inline reads of large or multiple files accumulate context silently; Explore returns excerpts/summaries, not full content.
- **Any grep, find, rg, fd, or similar search command → delegate to Explore subagent regardless of output size.** Search is exploration even when results are small; the main thread must not perform raw file discovery. Sequential greps compound the problem — delegate the entire sequence together.
- **Bash commands expected to return >20 lines → delegate to subagent, return only relevant output.** Verbose output (label lists, directory trees, test logs) pollutes main context; the subagent filters to what matters.
- Subagents must run commands and show actual output — never claim results without running the command.
- **Before parallelising subagent tasks, map which files each modifies** — tasks touching the same file must be sequenced; overlapping writes cause merge conflicts.
- **Cap all subagent response lengths — long outputs go to `.scratch/`, main thread gets a summary only.** Verbose subagent returns (findings reports, stress-test output, exploration dumps) land in main context in full and compound across a long session. Instruct every subagent: "report in under 150 words; write full findings to `.scratch/<filename>.md` and return only a decision-relevant summary." Read the file only if a specific detail is later needed.
- **Establish shared definitions before handing off** — misaligned terms cause the subagent to analyse the wrong thing.
- When parallel subagents may outlive the main script, use explicit per-subagent waits — a collect-all pattern exits before containers finish if any subagent completes early.
- Do not trust a subagent's summary alone — read the file or run `git diff` before reporting complete.

## Subagent Git Operations

**When spawning a subagent that creates commits, branches, or PRs: read `.claude/rules/subagent-git.md` and include its full contents verbatim in the subagent prompt before the task description.** Subagents have no parent context and consistently miss `Closes #N`, requiring manual issue closure.

- After parallel subagent merges, pull main and verify integrated state before dispatching the next round.
- Confirm the previous PR is merged and working directory is clean on main before starting the next task.
- Before creating a bug issue, check if an open PR already covers that code area — fold the fix into that branch instead.
- Verify working-directory state after subagent branch operations — branch switches affect the running dev server.

## GitHub and Just

- **Always use `gh` CLI for any `mcp__github__*` call involving arrays or numeric IDs.** Upstream SDK bug (anthropics/claude-code#18260) serialises these as strings.
- `just <target>` ignores the "Working directory" prompt field — always prefix with `cd /home/mcooney/workspace/gamebook_helper &&`.

## Workflow Sequencing

- **Run `grill-me` before creating the GitHub issue** — closes ambiguity and achieves the ≥95% confidence threshold; issue creation comes after.
- **Run grill-me in the main thread only** — it requires interactive back-and-forth with the user; cannot run inside a subagent.
- **Verify game-system-specific features end-to-end using that exact system** — generic tests miss architecture violations such as wrong stat field names per system.
- **Use /diagnose when something fails with no known root cause** — the issue emerges from the diagnosis; create it after, not before.
- **Defer issue creation and branching until exploration stabilises; batch as one issue** — incremental issue creation during rapid iteration interrupts flow.
- **Skip the written plan when grill-me and stress-test have closed ambiguity** — the conversation IS the plan.

## Scope Discipline

- **`/pcc` is decision support only** — present pros/cons/recommendation then stop; do not act until user directs.
- **Don't promote deferred backlog items to next action without explicit user confirmation** — scope decisions rest with the user.
- Do not suggest removing the `git push --force` permission gate — rebase friction is accepted in exchange for safety.
- **Long-running background tasks use the main thread's background queue (Monitor/TaskOutput), not subagents** — subagents exit after initiating without lifecycle awareness.
- Analyse systematic failures before re-running expensive experiments — re-collecting without prompt changes produces the same result.

## Codebase and File Hygiene

- **Spec files belong in a git-tracked `docs/` folder, not `.scratch/`** — specs are project provenance; treating them as ephemeral staging loses version history.
- **Before assuming a file is active/stale/unused**, check git history, hooks, and compose files — script wiring may live in compose, not just Justfile.
- **Verify `.scratch/` docs against actual code before including in subagent prompts** — staging docs drift during active refactors; check command syntax and file paths.
- **Write handoff notes in `.scratch/NEXT_STEPS.md`** and refresh them to reflect failed attempts before starting a new session — stale scope carryover reopens already-failed approaches.
- **Respect Chesterton's Fence** — file an issue before removing structure whose purpose isn't obvious.
