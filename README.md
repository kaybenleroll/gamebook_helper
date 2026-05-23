# gamebook_helper

A digital companion for physical gamebooks (Fighting Fantasy, Grail Quest). Tracks character stats, combat, inventory, spells, section history, and maps while you play.

## Setup

Requires [Podman](https://podman.io/) and [just](https://just.systems/).

```bash
# Start the development environment
just dev-start

# Enable git hooks (run once after cloning)
git config core.hooksPath .githooks
```

## Development

| Command | Purpose |
|---|---|
| `just dev-start` | Start app + database containers |
| `just test` | Run all tests (required before committing) |
| `just test-unit` | Unit tests only |
| `just test-e2e` | E2E tests only |
| `just db-reset` | Drop and recreate database |
| `just db-seed` | Seed the database |
| `just logs-app` | View app container logs |

All app commands run inside the `gamebook-app` container — never on the host directly.

## Git workflow

- All work goes on feature branches; never commit directly to `main`
- Branch naming: `just branch <issue-number> "short-description"`
- PRs are squash-merged
