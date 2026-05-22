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
- **Establish shared definitions before handing off** — misaligned terms cause the subagent to analyse the wrong thing.
- When parallel subagents may outlive the main script, use explicit per-subagent waits — a collect-all pattern exits before containers finish if any subagent completes early.
- Do not trust a subagent's summary alone — read the file or run `git diff` before reporting complete.

## Subagent Git Operations

**When spawning a subagent that creates commits, branches, or PRs: read `.claude/rules/subagent-git.md` and include its full contents verbatim in the subagent prompt before the task description.** Subagents have no parent context and consistently miss `Closes #N`, requiring manual issue closure.

## GitHub and Just

- **Always use `gh` CLI for any `mcp__github__*` call involving arrays or numeric IDs.** Upstream SDK bug (anthropics/claude-code#18260) serialises these as strings.
- `just <target>` ignores the "Working directory" prompt field — always prefix with `cd /home/mcooney/workspace/gamebook_helper &&`.

## Workflow Sequencing

- **Run `grill-me` before creating the GitHub issue** — closes ambiguity and achieves the ≥95% confidence threshold; issue creation comes after.
- **Use /diagnose when something fails with no known root cause** — the issue emerges from the diagnosis; create it after, not before.
- **Defer issue creation and branching until exploration stabilises; batch as one issue** — incremental issue creation during rapid iteration interrupts flow.
- **Skip the written plan when grill-me and stress-test have closed ambiguity** — the conversation IS the plan.

## Scope Discipline

- **`/pcc` is decision support only** — present pros/cons/recommendation then stop; do not act until user directs.
- **Don't promote deferred backlog items to next action without explicit user confirmation** — scope decisions rest with the user.
- **Long-running background tasks use the main thread's background queue (Monitor/TaskOutput), not subagents** — subagents exit after initiating without lifecycle awareness.
- Analyse systematic failures before re-running expensive experiments — re-collecting without prompt changes produces the same result.

## Codebase and File Hygiene

- **Before assuming a file is active/stale/unused**, check git history, hooks, and compose files — script wiring may live in compose, not just Justfile.
- **Verify `.scratch/` docs against actual code before including in subagent prompts** — staging docs drift during active refactors; check command syntax and file paths.
- **Write handoff notes in `.scratch/NEXT_STEPS.md`** and refresh them to reflect failed attempts before starting a new session — stale scope carryover reopens already-failed approaches.
- **Respect Chesterton's Fence** — file an issue before removing structure whose purpose isn't obvious.
