---
triggers:
  - "When spawning a subagent"
  - "When creating a subagent prompt"
  - "When delegating commit or PR work"
---

# Subagent Git Briefing

> Include this file verbatim in any subagent prompt that creates commits, branches, or pull requests.

## Critical PR Rules

- **`Closes #N` must appear in the PR body** — one per line. Example: `Closes #2987`
  - `(#NNN)` in the PR title does **NOT** auto-close issues — only `Closes #N` in the body does
  - Comma-separated chains (e.g. `Closes #1, #2`) only close the first issue — use one line per issue
- **Merge method: squash** — always pass `--squash` to `gh pr merge` or `merge_method: "squash"` via API
- **Never `--delete-branch`** when merging — remote branches are preserved intentionally
- **Never commit directly to main** — all work goes on a feature branch
- **Push all commits to remote before squash-merging** — local-only commits are silently lost

## Before Creating Any GitHub Issue

Run this exact command and verify label names against the output before calling `gh issue create`:

```bash
gh label list --repo kaybenleroll/gamebook_helper --json name -q '.[].name' | sort
```

Never guess label names — GitHub silently creates new labels if names do not match exactly.

Canonical label taxonomy:

```
Priority: P0: critical | P1: high | P2: medium | P3: backlog
Type:     type: bug | type: feature | type: enhancement | type: tech-debt | type: docs | type: research
Area:     area: frontend | area: backend | area: database | area: devops | area: game-systems
Effort:   effort: S | effort: M | effort: L | effort: XL
```

Every issue requires: 1 Priority + 1 Type + 1+ Area + 1 Effort.

## Writing Effective Issue Bodies

An issue body is the contract a subagent works from. Write it so it stays useful as the codebase changes.

**Four principles:**

1. **Durability over precision** — describe interfaces, types, and behavioral contracts. Never reference file paths or line numbers — they go stale before the issue is picked up.
2. **Behavioral not procedural** — describe what the system should do, not how to implement it. Good: "When X happens, Y should occur." Bad: "Open file Z and add a switch statement."
3. **Complete acceptance criteria** — every issue needs concrete, independently testable criteria. Bad: "Triage should work correctly." Good: "Running `gh issue list --label needs-triage` returns only issues that have been classified."
4. **Explicit scope boundaries** — state what is out of scope to prevent gold-plating or scope creep.

**Template:**

```markdown
**Current behavior:**
What happens now. For bugs: the broken behavior. For enhancements: the status quo.

**Desired behavior:**
What should happen after the work is complete. Include edge cases and error conditions.

**Key interfaces:**
- `TypeName` — what needs to change and why
- `functionName()` — current return type vs desired return type
- Any config shape changes

**Acceptance criteria:**
- [ ] Specific, testable criterion
- [ ] Another criterion

**Out of scope:**
- Thing that should NOT be changed in this issue
```

## Branching

- Create branch via: `cd /home/mcooney/workspace/gamebook_helper && just branch {issue-number} "short-description"`
- Working directory must be clean before running `just branch` — the recipe blocks on untracked files

## Owner / Repo

- Owner: `kaybenleroll`
- Repo: `gamebook_helper`
