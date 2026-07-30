#!/usr/bin/env bash

set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

if printf '%s' "$command" | grep -qE 'git[[:space:]]+reset[[:space:]]+--hard'; then
  printf '%s\n' 'destructive reset blocked' >&2
  exit 2
fi
