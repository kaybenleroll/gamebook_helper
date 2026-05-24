# CLAUDE.md

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

- **Stack**: Next.js app + SQLite (via Drizzle ORM)
- **Containers**: `gamebook-app` (app only) — SQLite runs embedded; DB file persisted to `gamebook_db` named volume. Edit code on the host, run it in containers.
- **Game systems**: Fighting Fantasy, Grail Quest — the data model is system-aware; stats, dice mechanics, and combat rules differ per system. Never hardcode stat sets, dice mechanics, or combat rules for a single system.
- **Auth**: No auth for now — design with auth-ready patterns throughout: middleware stub, user-scoped data shapes

## Non-Obvious Constraints

- **UK English** throughout (analyse, colour, behaviour)
- `rm` is aliased to interactive — use `command rm -f` in scripts
- `eslint.config.mjs` is baked into the image (not bind-mounted) — after editing locally run: `podman cp eslint.config.mjs gamebook-app:/app/`
- Install packages: `podman exec gamebook-app npm install <pkg>`; to remove, edit `package.json` directly — `npm uninstall` only strips the container's `node_modules`
- Backwards compatibility is never a blocker — break it when architecture or design is better
- `.scratch/` is gitignored — stage experimental files there until patterns stabilise, then promote; never commit from it
- Tailwind `@theme` silently drops CSS custom properties using `var()` — use raw values inside `@theme` blocks
- Next.js 15 + pino routes must declare `export const runtime = 'nodejs'` — Edge runtime is incompatible
- E2E test sessions must use the `[test]` name prefix for global-teardown cleanup
- SSR caches game-system module state at page load — new fields need a hard browser refresh

## Behavioural Rules

- Always `just test` before committing
- Subagents have no parent context — always include `cwd: /home/mcooney/workspace/gamebook_helper` and `owner: kaybenleroll, repo: gamebook_helper` in every subagent prompt
- **PR lifecycle**: commit freely on the feature branch; don't push/open PR until tsc passes + verified end-to-end; post-merge fixes go on a fresh branch
- Delegate ALL non-trivial work to subagents — research, exploration, implementation, test runs. Main thread orchestrates only.
  - File reads for reference/research → Explore subagent
  - Any grep/find/rg/fd/search → Explore subagent
  - Bash commands expected to return >20 lines → subagent, return only relevant output
- **`/verify` dispatches a subagent** — spawn one immediately for all steps (tests, Playwright, screenshots, API probes); main thread reads report only; no exceptions
- Use the `git-workflow` skill before any GitHub operation (issue creation, branching, PRs, merges)
- Use `/new-feature` for new features — sequences grill-me → write-a-prd → stress-test → prd-to-issues → git-workflow
- Skip `/brainstorming` — design refinement in this project happens through direct dialogue on proposed changes
