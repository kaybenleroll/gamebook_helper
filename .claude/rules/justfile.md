---
paths:
  - "Justfile"
  - "**/Justfile"
description: Prescriptive constraints for writing Justfile content — single-quote rules, indentation, apostrophes, heredoc control flow.
---

# Justfile Syntax and Style Rules

## CRITICAL: Avoid Single Quotes in User-Facing Messages

Never use single quotes (`'`) in echo statements or comments — VSCode's Just syntax highlighter treats them as string delimiters and breaks highlighting for the entire file.

- Use backticks for code references: `echo "Run \`git stash\` to save changes"`
- Single quotes in shell commands are fine (necessary): `podman exec container sh -c 'cmd'`
- ANSI escape sequences are fine: `RED='\033[0;31m'`

## Indentation

Use **2 spaces** per indentation level (not 4).

## Grammar Apostrophes in Comments

Replace grammar apostrophes (contractions, possessives) in `# comments` with the Unicode right single quotation mark `'` (U+2019) — visually identical but not treated as a string delimiter.

Pattern: `# podman-compose down can't remove pod infra containers`

Single quotes used as **matched string delimiters** in comments (e.g. `pass 'follow' to stream`) are fine — matched pairs do not confuse the highlighter.

## Multi-Word Arguments via `{{args}}`

`just {{args}}` strips quotes from multi-word arguments — call `podman-compose` directly to preserve quoting.

## Heredoc Shell Control Flow

`just`'s parser interprets shell keywords (`if`, `then`, `fi`, `for`) inside heredocs as `just` constructs — they are NOT passed verbatim to the shell. Use an external script file for any recipe that embeds shell control flow in a heredoc.

## Recipe Tips

- Use `ls -t | head -1` to find the most recently created dynamic file within a recipe — safer than passing filenames that may contain spaces or special characters as arguments
