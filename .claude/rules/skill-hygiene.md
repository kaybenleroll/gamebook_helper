---
triggers:
  - "When editing skill files"
  - "When running /reflect"
  - "When promoting learnings"
---

# Skill Hygiene

## Promoting Learnings

- **If the decision is already captured in committed config** (e.g. settings.json allowlist, schema constraint), skip writing a rule — config is durable documentation and a rule adds redundant overhead.
- **`learnings.md` is a staging area, not a log** — before promoting, verify the content isn't already in SKILL.md/CLAUDE.md/rules; promote into SKILL.md then clear. Accumulation is a failure state.
- **`learnings.md` is not auto-loaded** — the SKILL.md must contain `!cat ${CLAUDE_SKILL_DIR}/learnings.md 2>/dev/null || true`; global SKILL.md loads global learnings, project SKILL.md loads project learnings; these never cross.
- **If a project skill has no local SKILL.md**, keep `learnings.md` as-is — `/reflect` routes to the global skill version, not the project copy.
- **Condense promoted rules to one clause** — multi-clause learnings incur a per-session token cost that compounds across all rules files.
- **Reject learnings where the stated solution doesn't address the stated problem** — mischaracterised causation becomes embedded technical debt.
- **When a learning prohibits a tool, verify causation before promoting** — the constraint may be a missing step in the subagent prompt, not a genuine tool ban.
- **Audit learnings for cross-skill relationships before routing** — items spanning skills may describe a single domain rule; route by content, not by routing hint.

## Placement and Deduplication

- **Before adding a rule to a project rules file, check `~/.claude/CLAUDE.md`** — if global CLAUDE.md already covers it, don't duplicate; copies drift independently.
- **`CLAUDE.md` loads unconditionally every session; `.claude/rules/*.md` files are conditional** — they only load when `paths:` or `triggers:` match; critical always-on constraints belong in CLAUDE.md.
- **Keep CLAUDE.md entries to one terse line** — constraints and tooling rules only; move verbose detail to `.scratch/` or dedicated docs.
- **Distinguish structural from semantic duplication** — identical content across files may be necessary for each file's context; verify before trimming.

## Editing Skill Files

- **Preserve YAML frontmatter** — it contains trigger conditions; add explicit `TRIGGER when:`/`SKIP:` conditions or skills fail to auto-invoke. Use the `claude-api` skill as a template.
- **Preserve explicit imperative tool invocations in local CLAUDE rules even when frontmatter triggers exist** — triggers alone are insufficient; concrete local examples are required for abstraction to be actionable.
- **Reject rules that hardcode specific file paths** — a rule naming a specific file breaks when it is renamed; write the pattern, not the path.
- **Before removing a skill flagged as duplicate, read both files** — title similarity often masks distinct purposes and reference patterns absent from the survivor.
- **Before removing a shared skill, check git blame/log for collaborator usage** — transcript analysis only captures your own sessions; other team members' usage is invisible.

## Scope Discipline

- **When asked about model readiness or migration, distinguish product code from Claude Code config** — they are distinct audit domains; confirm scope before delegating research.
