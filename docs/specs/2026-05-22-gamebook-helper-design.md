# Gamebook Helper — Design Spec
## 2026-05-22

### Purpose
A digital companion for playing physical gamebooks (Fighting Fantasy, Grail Quest, etc.). Replaces pencil, paper, and dice. Does NOT contain or display book content — the user reads the physical book and uses the app to track their game state.

### Stack
- Next.js 14+ (App Router), TypeScript, SQLite (better-sqlite3) + Drizzle ORM
- Containerised: single `gamebook-app` service (debian-slim Node.js) via Podman Compose. SQLite database file on a named Podman volume at `/app/data/gamebook.db`. No separate database container.
- Note: `better-sqlite3` is a native C++ binding — the container base image must be debian-slim, not Alpine.
- UK English throughout

### Core Features (v1 scope)
1. Session management — create and resume play sessions (one session = one book playthrough)
2. Character sheet — display and adjust system-specific stats during play
3. Dice roller — roll system-appropriate dice
4. Dungeon/location map editor — topological grid map

### Game System Architecture
Each game system (Grail Quest, Fighting Fantasy, etc.) implements a `GameSystem` interface:
- `id: string` — unique identifier
- `name: string` — display name
- `stats: StatDefinition[]` — stat labels, min/max, initial dice specs
- `primaryHealthStat: string` — which stat represents health/life (game over when 0)
- `diceSpec: DiceSpec` — default dice roll for the system

Character stats stored as JSON (flexible key/value) so adding new game systems requires no schema changes.

### Map Data Model
Topological grid map where cells represent locations (not strict spatial scale, but cardinal orientation is preserved: north=up, south=down, east=right, west=left).

**Cell styles** (generic — works for dungeons AND outdoor environments):
- `enclosed` — room, cave chamber, building interior
- `open` — clearing, town square, crossroads
- `path` — corridor, trail, road
- `water` — river, lake, ford
- `barrier` — wall, cliff, impassable terrain
- `unknown` — unexplored

**Passage types** (on edges between adjacent cells):
- `open`, `door`, `secret`, `locked`, `one_way`, `blocked`

**Cell annotations** (all optional): `sectionNumber: int`, `label: string`, `notes: string`

**DB tables**: `maps`, `map_cells`, `map_edges`

### Session Data Model
- `sessions`: id, game_system_id, book_title, created_at, updated_at
- `characters`: id, session_id, stats (JSON), initial_stats (JSON), created_at
- Map created automatically (20×20 default) on session creation

Note: Drizzle schema definitions (TypeScript) replace raw SQL init scripts. `just db-reset` wipes and recreates the SQLite file via Drizzle migrations.

### Auth
No auth in v1. Design with auth-ready patterns: middleware stub, user-scoped data shapes.

### Deferred
- Fighting Fantasy system (after Grail Quest validates the abstraction)
- Section flowchart map (second map type after grid)
- Maps as the second feature epic (foundation + character sheet + dice first)
