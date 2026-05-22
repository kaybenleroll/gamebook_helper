# Start development environment
dev-start:
  podman-compose up -d

# Stop all containers
dev-stop:
  podman-compose down

# View app logs (follow)
logs-app:
  podman-compose logs -f gamebook-app

# Rebuild a container after Dockerfile or dependency changes
rebuild service:
  podman-compose build {{service}}
  podman-compose up -d --no-deps {{service}}

# Run all tests
test:
  podman exec gamebook-app npm test

# Run unit tests only
test-unit:
  podman exec gamebook-app npm run test:unit

# Run E2E tests only (requires gamebook-app to be running)
test-e2e:
  podman-compose --profile test run --rm gamebook-playwright npx playwright test

# Run full test suite (required before PR)
test-all: test-unit test-e2e

# Wipe and recreate the SQLite database # DESTRUCTIVE
db-reset:
  podman exec gamebook-app sh -c 'rm -f /app/data/gamebook.db && npm run db:push'

# Seed the database
db-seed:
  podman exec gamebook-app npm run db:seed

# Build demo with npm ci from scratch (catches real regressions)
demo-build:
  podman-compose build --no-cache gamebook-app

# Remove containers and volumes # DESTRUCTIVE
clean:
  podman-compose down
  podman volume rm gamebook_helper_gamebook_db 2>/dev/null || true

# Create a feature branch from latest main (usage: just branch 42 add-dice-roller)
branch issue description:
  git checkout main
  git pull origin main
  git checkout -b feature/issue-{{issue}}-{{description}}
