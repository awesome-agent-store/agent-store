#!/usr/bin/env bash
# Print "API_PORT=<n> STORE_PORT=<m>" for `make dev-env`: the first free TCP ports
# at/above the preferred defaults (api 3001, store 3000), guaranteed distinct.
# Lets dev-env pick usable ports instead of failing with EADDRINUSE when a
# previous run's servers are still bound.
set -u

is_free() { ! lsof -ti tcp:"$1" >/dev/null 2>&1; }

# pick <preferred-start> <excluded-port>
pick() {
  local p=$1
  while :; do
    if [ "$p" != "$2" ] && is_free "$p"; then echo "$p"; return; fi
    p=$((p + 1))
  done
}

api=$(pick 3001 "")
store=$(pick 3000 "$api")
echo "API_PORT=$api STORE_PORT=$store"
