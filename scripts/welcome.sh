#!/bin/sh
# One-time welcome after install; afterwards a one-line pointer only when the project has paperloop state.
DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/paperloop}"
MARK="$DATA/welcomed"
if [ ! -e "$MARK" ]; then
  mkdir -p "$DATA" && touch "$MARK"
  printf '%s\n' '{"systemMessage":"paperloop installed. Run /paperloop:start to set up a paper (write a draft from results, or revise an existing one with a learning review loop).","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The paperloop plugin is installed. If the user asks about writing or improving a paper, suggest /paperloop:start."}}'
elif [ -f .paperloop/config.json ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"This project uses paperloop (.paperloop/config.json). For paper status run /paperloop:start; project history is in PROJECT-LOG.jsonl and DECISIONS.md."}}'
fi
exit 0
