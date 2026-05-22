---
name: git-workflow
description: "Full GitHub workflow reference for gamebook_helper — MCP tool parameters, issue label taxonomy, PR workflow, CLI fallback, branch conventions, and file safety details. TRIGGER before: creating issues, branching, committing, creating or merging PRs, or any GitHub operation."
---

# Git Workflow — Full Reference

## When the Full Workflow Applies

Full workflow (issue → branch → PR) required for ALL changes — code, docs, config, meta-files, seeds, skills.

PR creation may be deferred for exploratory/debug work — commit iteratively, create PR once complete.

Exceptions (no issue/branch/PR): design-only sessions or spikes that produce no commits — document the decision on the issue and close it directly.

Exception (branch only, no issue): meta hygiene on `.claude/` files (SKILL.md, learnings.md, rules) — the mandatory issue-first step is waived for pure meta/config work that doesn't affect product behaviour.

Never create issues or branches in plan mode. Wait for explicit user approval before touching GitHub.

## Issue Creation

1. Create all issues upfront — do not start with code. Create one at a time in the main thread (not subagent) for full label fidelity.
2. Verify any referenced issue is still open: `mcp__github__get_issue` before citing status. GitHub is source of truth — scratch files and NEXT_STEPS.md go stale. Closed ≠ delivered: features may have been reorganised without delivery; verify against acceptance criteria.
3. Use separate issues for analysis and execution phases.
4. When implementation surfaces an architectural decision, stop and file an issue rather than solving inline.

Always use `gh` CLI for issue creation — MCP `create_issue` silently creates unknown labels and serialises array params as strings, causing silent failures.

```bash
gh issue create \
  --title "[Type] Short description" \
  --body "Description..." \
  --label "P2: medium" --label "type: feature" --label "area: frontend" --label "effort: M"
```

Every issue MUST have 1 Priority + 1 Type + 1+ Area. Effort recommended. Use exact label names — GitHub silently creates new labels on mismatch. Default labels (`bug`, `documentation`, etc.) are intentional — never delete them.

## Label Taxonomy

**Priority:** `P0: critical` | `P1: high` | `P2: medium` | `P3: backlog`

**Type:** `type: bug` | `type: feature` | `type: enhancement` | `type: tech-debt` | `type: docs` | `type: research`

**Area:** `area: frontend` | `area: backend` | `area: database` | `area: devops` | `area: game-systems`

**Effort:** `effort: S` (<2h) | `effort: M` (½–1 day) | `effort: L` (multi-day) | `effort: XL` (week+)

**Status:** `status: blocked` | `status: in-progress` | `status: needs-review`

## Branch Conventions

Pattern: `feature/issue-{number}-{description}`

```bash
just branch 42 "add dice roller"
# → Creates: feature/issue-42-add-dice-roller (from latest main)
```

If accidentally on main: `git stash -u`, create issue, `just branch {number} "desc"`, `git stash pop`.

After branching, reapply any local config changes — `just branch` starts from clean main; local `compose.yml` edits are lost.

Local cleanup after merge (remote branches are kept): `git branch | grep 'feature/issue-' | xargs git branch -D`

## PR Creation and Merge

EVERY PR body MUST contain `Closes #N` — title/commit references do NOT close issues. No exceptions.

1. Run full test suite: `just test-all` — not just type-check.
2. Push: `git push -u origin feature/issue-{number}-{description}`
3. Create PR: title `"Description (Issue #{number})"`, head = branch, base = `main`, body with summary, testing notes, and `Closes #{number}`.
4. Merge: `merge_method: "squash"`. Never `--delete-branch` — remote branches retained for audit.
5. Proactively create and merge once tests pass — do not wait to be asked.

```bash
# CLI fallback
gh pr create --title "Description (Issue #{number})" --body "..."
gh pr merge {number} --squash
# DO NOT use --delete-branch
```

Multiple closes: one per line — `Closes #123, #124` only closes the first. Multi-phase work shares one PR — list all `Closes #N` lines.

Conflict gotchas:
- GitHub's conflict UI can lie. Verify: `git merge-tree $(git merge-base main feature/issue-N-desc) main feature/issue-N-desc`
- PR bases don't auto-retarget — after a feature branch merges, re-target main manually.

## MCP GitHub Tools

Default: `owner: "kaybenleroll"`, `repo: "gamebook_helper"`. Prefer MCP; use `gh` CLI for array/numeric params where SDK serialisation fails.

| Operation | MCP Tool | Key Parameters |
|-----------|----------|----------------|
| Create issue | `mcp__github__create_issue` | `title, body, labels[]` |
| List issues | `mcp__github__list_issues` | `state?, labels?[]` |
| View issue | `mcp__github__get_issue` | `issue_number` |
| Update issue | `mcp__github__update_issue` | `issue_number, title?, body?, state?` |
| Create PR | `mcp__github__create_pull_request` | `title, head, base, body` |
| List PRs | `mcp__github__list_pull_requests` | `state?, head?` |
| View PR | `mcp__github__get_pull_request` | `pull_number` |
| Merge PR | `mcp__github__merge_pull_request` | `pull_number, merge_method?` |
| PR files | `mcp__github__get_pull_request_files` | `pull_number` |
| PR status | `mcp__github__get_pull_request_status` | `pull_number` |
| Create branch | `mcp__github__create_branch` | `branch, from_branch?` |
| Get file | `mcp__github__get_file_contents` | `path, branch?` |
| Push files | `mcp__github__push_files` | `branch, files[], message` |

CLI-only: `gh pr checkout {number}`, `gh pr view {number} --web`, `gh label create/list/edit/delete`, `gh pr close/reopen`.

Never `gh pr view {number}` bare — use `--json` to avoid Classic Projects GraphQL errors:
```bash
gh pr view 14 --json number,title,state,url,headRefName,baseRefName
```

Field names use `At` suffix: `mergedAt`, `closedAt`, `createdAt`, `updatedAt`.

## File Safety

`.scratch/` is gitignored and ephemeral — never commit from it. Restrict repository analysis to git-tracked files unless explicitly asked to include untracked items.

Staging rules:
- After Write tool creates a file, `git add <specific-path>` immediately. Check `git status` before stashing — `??` = untracked = NOT in stash = will be lost. Stash including untracked: `git stash -u`.
- With multiple branches in flight, only stage files from the current branch — `git add .` picks up changes across all branches.

Temp file cleanup: `command rm -f <specific-files>`. Never `git clean -fd` without asking — `??` may be a forgotten `git add`.

Re-read files after a Git rename — cached content goes stale when a file is moved.

## Gotchas

- Verify current branch with `git branch --show-current` before reporting any branch-sensitive operation complete.
- Verify PR merge state with `gh pr view {number} --json state,mergedAt` before claiming completion — never assume.
- When recommending backlog items, verify issue status first — `gh issue view {number} --json state` before citing as actionable.
- GitHub Actions: failure email only sent when `core.setFailed()` is called — warnings-only exits show green.
- Justfile destructive targets: no `y/N` prompts — they hang in CI. Mark with `# DESTRUCTIVE`.
- Event-driven rules → `settings.json` hooks. Per-PR constraints (e.g. `Closes #N`) → CLAUDE.md, not memory.
- Ask before committing when user signals ongoing work — phrasing like "we are going to work on them now" means staged changes are not ready; wait for an explicit commit signal.
- Pull main before investigating merged PRs — working with stale local main creates false debugging paths.
- Use `.claude/rules/` files (not skill triggers) for issue creation workflows — triggers fire only on user message content, not during autonomous mid-workflow operations; rules files load regardless of invocation path.
- Keep label taxonomy in both `.claude/rules/subagent-git.md` AND `SKILL.md` — they serve different loading contexts; both must stay in sync to prevent drift in autonomous workflows.

!`cat ${CLAUDE_SKILL_DIR}/learnings.md 2>/dev/null || true`
