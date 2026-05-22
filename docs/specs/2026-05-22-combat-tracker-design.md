# Combat Tracker — Design Spec (Issue #38)

**Date:** 2026-05-22
**Status:** Approved

## Context

Highest-value remaining feature for the Grail Quest Book 1 UAT. App must let a player track combats from the book — enemy stats, round-by-round dice with player choice, HP, victory/defeat, XP. Game books contain enough variability ("you fight at −1 SKILL this combat", "you take 3 damage automatically", optional attack modes per round) that full automation is the wrong design. The tracker assists, it doesn't drive.

GQ is the launch system. FF will plug in later via the same `CombatModule` interface. Server is dice-of-record so a mid-fight refresh resumes cleanly; player can also override the server's roll when the book overrules dice.

## Architecture

- Per-system payloads as JSON columns (`enemyStats` immutable, `enemyState` mutable, `metadata` for initiative etc.)
- Server-side dice via shared `src/lib/dice.ts` extracted from the existing `/api/dice/roll` route
- Round resolution + character stat update in one DB transaction
- Partial unique index on `combats(sessionId)` where `outcome = 'in_progress'` — at most one active combat per session
- Lift shared character stats into a thin `SessionClient.tsx` wrapper around `CharacterSheet` + `CombatPanel`; no `router.refresh()` per round
- `combat: CombatModule` is an OPTIONAL field on `GameSystem` — FF can ship without it

## Round model

Not a single "Resolve round" button. Each round is a small form:

1. **Per-round system options** — driven by `CombatModule.roundOptions(state)`. For GQ Book 1 round 1 this exposes the "risky attack" toggle (target 8 instead of 7, double damage on hit). System decides what's offered when.
2. **Combat-wide modifiers** — set at start of fight or edited mid-fight (e.g. attack +/-, damage +/-, target-number override). Persist on `combats.metadata`.
3. **Server roll** — uses options + modifiers, returns dice + provisional outcome.
4. **Post-roll overrides** — player can override the resulting damage dealt / damage taken before committing the round (covers "the book says you take 3 damage regardless").
5. **Commit** — POST /rounds writes the row with options, dice, overrides, final outcome.

## UX Decisions

- **Panel placement**: between `CharacterSheet` and the dice roller on the session page.
- **Round log**: raw dice + plain language — e.g. `Round 3 — Your attack [4+5]=9 (≥7 hit), dealt 4 damage. Enemy [3+6]=9 (≥7 hit), took 2 damage.`
- **XP on victory**: hybrid — enemy form has an XP field; if filled, award silently on win; if blank/zero, end-of-fight modal "Award XP from this fight?" with input + Skip.
- **Combat history on game-over**: history remains browsable on the read-only session view; a defeated session is locked for new combats but its log stays readable.
- **Unarmed (GQ)**: allowed; defaults to 1 damage / threshold 7; override fields cover book-specific cases.
- **Initiative tie (GQ)**: re-roll.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/[id]/combats` | Start fight — validates enemy stats via game system |
| GET | `/api/sessions/[id]/combats` | `{ active, history }` |
| GET | `/api/sessions/[id]/combats/[combatId]` | Single fight detail incl. rounds |
| POST | `/api/sessions/[id]/combats/[combatId]/rounds` | Append next round; body carries chosen options + overrides; append-only audit log |
| PATCH | `/api/sessions/[id]/combats/[combatId]` | Manual end (flee, "book says fight ends") |

## Schema

```ts
// combats table
{
  id, sessionId (FK), enemyName,
  enemyStats: jsonb,   // immutable starting stats
  enemyState: jsonb,   // mutable: currentHp, etc.
  metadata: jsonb,     // initiative, combat-wide modifiers, enemyXp, etc.
  outcome: 'in_progress' | 'player_won' | 'player_lost' | 'player_fled',
  startedAt, endedAt
}
// partial unique index: (sessionId) WHERE outcome = 'in_progress'

// combat_rounds table
{
  id, combatId (FK), roundNumber,
  detail: jsonb,       // chosen options, raw dice rolls, narrative segments
  damageDealt: int, damageTaken: int,
  createdAt
}
```

## Game System Interface

```ts
type CombatModule = {
  enemyStatFields: FieldSpec[];
  validateEnemyStats(input: unknown): string[];
  start(input: unknown): { enemyState: unknown; metadata: unknown };
  roundOptions(state: CombatState): RoundOption[];
  resolveRound(args: {
    enemyStats: unknown;
    enemyState: unknown;
    metadata: unknown;
    characterStats: unknown;
    chosenOptions: Record<string, unknown>;
    combatModifiers: Record<string, unknown>;
  }): {
    enemyState: unknown;
    characterDeltas: Record<string, number>;
    detail: unknown;
    damageDealt: number;
    damageTaken: number;
    outcome: CombatOutcome | null;
  };
};
```

`grail-quest.ts` implements this; `fighting-fantasy.ts` omits the field entirely.

## Files to create / modify

- `src/lib/db/schema.ts` — `combats`, `combat_rounds`, partial unique index
- `src/lib/dice.ts` — extracted dice roller (refactor `/api/dice/roll` route to call it)
- `src/lib/game-systems/types.ts` — `CombatModule` interface, `RoundOption`, `CombatState`, `CombatOutcome`
- `src/lib/game-systems/grail-quest.ts` — `combat` module
- `src/app/api/sessions/[id]/combats/route.ts` — GET, POST
- `src/app/api/sessions/[id]/combats/[combatId]/route.ts` — GET, PATCH
- `src/app/api/sessions/[id]/combats/[combatId]/rounds/route.ts` — POST
- `src/app/sessions/[id]/CombatPanel.tsx` — start form, active fight UI, round options form, post-roll override fields, round log, end-of-fight XP modal
- `src/app/sessions/[id]/SessionClient.tsx` — wrapper lifting character stat state
- `src/app/sessions/[id]/page.tsx` — fetch active combat + history; render via `SessionClient`

## Out of scope

- Fighting Fantasy combat — FF system ships later (Issue #35); `combat?: CombatModule` stays optional
- Inventory effects on combat (weapon damage bonuses from items) — Issue #39
- Combat-derived map/section auto-advancement — player navigates sections manually
