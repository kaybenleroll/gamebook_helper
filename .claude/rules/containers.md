---
paths:
  - "compose.yml"
  - "**/Dockerfile"
triggers:
  - "When working with Docker or Podman"
  - "When working with container files"
  - "When using podman or docker commands"
---

# Container-Based Development Rules

All development happens **inside containers** — edit code on the host, run it in containers.

## Installing Frontend Packages

Install inside the container (not on host). Edit `package.json` directly when removing dependencies — `podman exec gamebook-app npm uninstall <pkg>` only removes from the container's node_modules, not from the mounted source file.

## mise (Host Tools Only)

`mise.toml` manages host orchestration tools only (just, gh, gcloud). Node.js is an exception — permitted on the host for Playwright E2E tests and vitest. Do NOT add Python — those belong in containers.

For troubleshooting: `just logs-*`, `podman ps -a`, `just rebuild <service>`, nuclear option: `just clean && just dev-start`.

## Dockerignore

Always add `.dockerignore` to multi-stage builds. Without it, `COPY` includes host `node_modules`, silently shadowing container-installed packages.

## Database Reset

`just db-reset` drops and recreates the database inside the running `gamebook-db` container, then replays all init SQL scripts. No container or volume changes — all services stay running.

## Podman Gotchas

- `podman-compose down -v` removes anonymous volumes but NOT named ones — run `podman volume rm gamebook_helper_db-data` explicitly before fresh init.
- Persisted volumes shadow image `node_modules` — new packages installed by `npm ci` in the image are hidden by the mounted volume. Install directly: `podman exec gamebook-app npm install <pkg>`.
- Containers must be running before `podman exec` or `npm run type-check` — commands fail silently if stopped; `podman inspect` exits 0 even for stopped containers, so check `State.Running` in JSON to verify state.
- `eslint.config.mjs` is baked into the image (not bind-mounted) — after editing locally: `podman cp eslint.config.mjs gamebook-app:/app/`.
- **Use `podman cp` to deliver gitignored env files into containers at runtime** — bind-mounting a missing host file causes compose start failure; `podman cp` after container start is the approved pattern.
- **Alpine cannot run glibc Node.js native binaries (sharp, better-sqlite3, Playwright) — use debian-slim** — they fail silently with musl.
- **Mount `tsconfig.json` writable for Turbopack — `:ro` causes EROFS crash** — Turbopack injects `.next/dev/types` entries at startup; copying the `:ro` pattern from adjacent mounts breaks it.
- Use per-container waits, not a single multi-container `podman wait` — exit code 125 occurs when any container exits before the wait registers it
- When a tool is missing from a container, fix the container image — running it on the host instead violates the architecture constraint
