#!/usr/bin/env bash
# Ensure the caller's personal Neon dev branch exists and print its pooled
# connection string on stdout. Local dev/e2e run against ephemeral Neon branches
# (copy-on-write clones of the test project's main branch) instead of a local
# Postgres — see the Makefile. Requires `neonctl auth` to have run once.
set -euo pipefail

PROJECT="${NEON_PROJECT:-late-sea-44274892}"
PARENT="${NEON_PARENT_BRANCH:-main}"
BRANCH="${1:-dev-$(whoami)}"

if ! neonctl branches list --project-id "$PROJECT" -o json | grep -q "\"name\": *\"$BRANCH\""; then
  neonctl branches create --name "$BRANCH" --parent "$PARENT" --project-id "$PROJECT" >/dev/null
fi

neonctl connection-string "$BRANCH" --project-id "$PROJECT" --pooled
