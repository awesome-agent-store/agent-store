#!/usr/bin/env bash
# Build and run the desktop client as a packaged debug .app for local dev.
#
# `tauri dev` runs an UNBUNDLED binary, which macOS LaunchServices does not treat
# as the registered handler for the agent-store custom scheme — so the OAuth
# deep-link never reaches the running dev window. Instead we build a debug bundle
# with a dev-only identity (com.aas.cli-gui.dev + agent-store-dev://, via
# tauri.dev.conf.json), register it, and run it directly. macOS then delivers the
# agent-store-dev:// callback to THIS running instance.
#
# Trade-off vs `tauri dev`: no frontend hot-reload — re-run `make dev` to pick up
# UI changes. The Rust/frontend builds are incremental, so re-runs are fast.
#
# Build-time env (baked into the frontend): VITE_STORE_URL (local store for the
# OAuth relay). Runtime env (read by the running app): AS_HOME, AS_STORE_URL,
# CLAUDE_CONFIG_DIR, CODEX_CONFIG_DIR — inherited from the caller (the Makefile).
set -euo pipefail
cd "$(dirname "$0")/.."   # apps/cli-gui

APP="src-tauri/target/debug/bundle/macos/Agent Store CLI Dev.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

echo "▸ building frontend (store=$VITE_STORE_URL, scheme=agent-store-dev)…"
VITE_AUTH_SCHEME=agent-store-dev pnpm build

echo "▸ building debug .app bundle (dev identity)…"
bun run prepare:tauri
bun run build:sidecar
pnpm exec tauri build --debug --bundles app --config src-tauri/tauri.dev.conf.json

echo "▸ registering $APP with LaunchServices…"
"$LSREGISTER" -f "$APP"

echo "▸ launching dev app…"
exec "$APP/Contents/MacOS/app"
