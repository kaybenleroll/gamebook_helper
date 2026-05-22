---
paths:
  - "package.json"
  - "package-lock.json"
  - "**/Dockerfile"
triggers:
  - "When bumping npm dependencies"
  - "When upgrading packages"
  - "When updating lockfiles"
  - "When changing package versions"
  - "When upgrading Node.js base image"
  - "When upgrading PostgreSQL image"
---

# Dependency Upgrade Validation Checklist

---

## Mandatory Validation Steps (in order)

After merging any dependency version bump, run these steps **before closing the tracking issue**:

```bash
# 1. Rebuild containers so node_modules matches the updated lockfile
just rebuild app

# 2. Reset database if a Postgres major version changed (e.g. 16→17)
just db-reset && just db-seed

# 3. Type-check against fresh node_modules (not stale dev container)
podman exec gamebook-app npm run type-check 2>&1 | grep '^src/' | sort

# 4. Run unit tests
just test-unit

# 5. Run demo build — dev container type-checks stale node_modules; demo-build
#    runs npm ci from scratch and catches real regressions.
just demo-build

# 6. Start demo + seed to verify runtime behaviour
just demo-start && just demo-seed

# 7. Run E2E tests
just test-e2e
```

## Scope Triggers

Run this full checklist whenever any of these change:

- Any entry in `package.json` `dependencies` or `devDependencies`
- Node.js base image version (Dockerfile)
- PostgreSQL image version

## Package Compatibility Notes

- **Install `remark-gfm` for table rendering in react-markdown v6+** — built-in table support was removed in v6; piped table syntax silently renders as plain text without it.
- **Explicitly install transitive peer dependencies not hoisted by pnpm** — pnpm strict isolation means transitive peer deps (e.g. `katex` as a peer of `rehype-katex`) are not hoisted; add them explicitly or imports fail at runtime.
