# Grail Quest Book 1 — Mechanics Reference

**Source:** The Castle of Darkness by J.H. Brennan
**Purpose:** Implementation reference for digital companion app

---

## Character Stats

| Stat | Generation | Range | Notes |
|------|-----------|-------|-------|
| Life Points (LP) | 2d6 × 4 | 8–48 | May reroll up to 3 times, take best |
| Experience Points (XP) | 0 | — | 1 per fight won or puzzle solved |
| Permanent LP bonus | XP ÷ 20 (floor) | max +10 | Carries between adventures |

---

## Combat Mechanics

### Attack roll
- Roll 2d6. Hit if roll ≥ 6.
- Damage = max(0, roll − 6). Roll 6 = 0 damage (glancing blow). Roll 8 = 2 damage.
- Same mechanic for both player and enemy.

### Win/loss conditions
- Enemy LP ≤ 5 → unconscious → **player wins**
- Enemy LP = 0 → dead → **player wins**
- Player LP ≤ 0 → **player loses**

### Risky attack (nose bop)
- Threshold becomes playerThreshold + 2 (default: 6+2 = 8)
- Double damage on hit

---

## Weapons (permanent equipment)

| Weapon | Player threshold | Damage bonus | Notes |
|--------|-----------------|--------------|-------|
| Excalibur Jr. (EJ) | 4 | +5 | The signature weapon of the series |
| Dagger | 6 | +2 | No threshold change |
| Sword | 6 | 0 | Standard weapon |
| Spear | 6 | Extra Damage* | *Extra Damage = roll 1 additional die, cost 1 die roll instead of 6 |
| Club | 6 | Extra Damage* | Same as spear |

---

## Armour

| Item | Effect |
|------|--------|
| Dragonskin jacket | −4 incoming damage (damage absorbed before LP) |

---

## Magic (consumables)

| Item | Quantity | Hit | Damage |
|------|----------|-----|--------|
| Firefinger lightning bolts | 10 | Auto-hit (no roll) | 10 each |
| Fireballs | 2 | Need ≥6 on 2d6 | 7–5 (variable) |

---

## Healing

| Method | Roll | Effect |
|--------|------|--------|
| Healing potion | — | Restores 2d6 LP; max 3 carried |
| Sleep (safe) | 5–6 on 1d6 | Restores 2d6 LP (cannot exceed starting LP) |
| Sleep (risky) | 1–4 on 1d6 | Enters Dreamtime (dangerous) |

---

## Avoiding fights

### Friendly reaction
- Roll 1d6 for enemy, 1d6 × 3 for yourself.
- If your total < enemy roll → creature is Friendly (treat as fight won).

### Bribery (sections marked *B)
- Roll 2d6: 1–7 = accepted (treat as fight won); 8+ = failed (treat as fight lost).
- Gold cost: *B = 100gp, **B = 500gp, ***B = 1,000gp.

---

## End-of-adventure carry-overs

- XP carries forward
- Permanent LP bonus (max 10) carries forward
- Gold carries forward
- Marked items carry forward
- Current LP resets (new 2d6×4 roll for next adventure)

---

## Notes for inventory implementation (#39)

- Weapons set `playerThreshold` and `damageBonus` on the combat start form
- Dragonskin jacket sets `incomingDamageReduction` (−4) — needs a combat modifier field
- Lightning bolts and fireballs bypass the normal roll mechanic entirely — will need special handling in the combat UI (likely a separate "use magic" action, not a round)
- Healing potions: consumable item that restores 2d6 LP outside of combat (or during, at risk)
