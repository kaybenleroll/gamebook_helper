# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory Workflow — Before Any Implementation

1. Create GitHub Issue with labels: Priority, Type, Area, Effort
2. Create branch: `cd /home/mcooney/workspace/gamebook_helper && just branch {issue-number} "description"`

**Never commit directly to main.**

## Commands

All app commands run via `podman exec gamebook-app <cmd>` — never on the host.

`just <target>` ignores the "Working directory" prompt field — always prefix: `cd /home/mcooney/workspace/gamebook_helper && just <target>`.

| Command | Purpose |
|---------|---------|
| `just dev-start` | Start development environment |
| `just test` | Run all tests — required before every commit |
| `just test-unit` | Unit tests only |
| `just test-e2e` | E2E tests only |
| `just test-all` | Full suite — required before creating a PR |
| `just rebuild <service>` | Rebuild container after Dockerfile or dependency changes |
| `just db-reset` | Drop and recreate database, replay all init SQL |
| `just db-seed` | Seed the database |
| `just logs-*` | View service logs |
| `just clean && just dev-start` | Nuclear reset — removes containers and volumes |
| `just demo-build` | Build demo; runs `npm ci` from scratch, catches real regressions |

**Type-check:** `podman exec gamebook-app npx tsc --noEmit` — establish a baseline before changes, diff after.

## Architecture

- **Stack**: Next.js app + Postgres
- **Containers**: `gamebook-app` (app) + `gamebook-db` (database) — edit code on the host, run it in containers
- **Game systems**: Fighting Fantasy, Grail Quest — the data model is system-aware; stats, dice mechanics, and combat rules differ per system. Never hardcode stat sets, dice mechanics, or combat rules for a single system.
- **Auth**: No auth for now — design with auth-ready patterns throughout: middleware stub, user-scoped data shapes

## Non-Obvious Constraints

- **UK English** throughout (analyse, colour, behaviour)
- `rm` is aliased to interactive — use `command rm -f` in scripts
- `eslint.config.mjs` is baked into the image (not bind-mounted) — after editing locally run: `podman cp eslint.config.mjs gamebook-app:/app/`
- Install npm packages inside the container: `podman exec gamebook-app npm install <pkg>`. When removing, edit `package.json` directly — `npm uninstall` only removes from the container's `node_modules`, not the mounted source file.
- Backwards compatibility is never a blocker — break it when architecture or design is better
- `.scratch/` is gitignored — stage experimental files there until patterns stabilise, then promote; never commit from it

## Behavioural Rules

- Always `just test` before committing
- Subagents have no parent context — always include `cwd: /home/mcooney/workspace/gamebook_helper` and `owner: kaybenleroll, repo: gamebook_helper` in every subagent prompt
- **PR lifecycle**: commit freely and atomically on the feature branch; do NOT push or open a PR until the implementation is fully validated (tsc passes + feature verified end-to-end). Each squash-merge advances main and causes conflicts on open branches. Post-merge fixes go on a fresh branch.
- Delegate ALL non-trivial work to subagents — research, exploration, implementation, test runs. Main thread orchestrates only.
  - File reads for reference/research → Explore subagent
  - Any grep/find/rg/fd/search → Explore subagent
  - Bash commands expected to return >20 lines → subagent, return only relevant output
- Use the `git-workflow` skill before any GitHub operation (issue creation, branching, PRs, merges)
