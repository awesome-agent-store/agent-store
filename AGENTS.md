# Agent Rules

## Provider switching / local proxy features

Before designing or implementing anything related to provider switching, local HTTP
proxying for Claude Code / Codex, config injection/restore, or model mapping — first
check whether these reference implementations already solved it:

- https://github.com/Rogers-F/code-switch-R (Go/Wails; local relay on `providerrelay.go`,
  config injection/restore in `claudesettings.go`/`codexsettings.go`/`proxystate.go`)
- https://github.com/farion1231/cc-switch (Tauri/Rust; proxy engine under
  `src-tauri/src/proxy/`, direct-injection path in `services/provider/mod.rs`)

If either repo (or a local checkout of either) is available, read the relevant source
before proposing a new design. Prefer adapting their proven approach over inventing one
from scratch — only deviate where this repo's stack or scope genuinely requires it, and
say so explicitly.

## UI implementation sign-off

Any UI work (Web Store or the desktop client, whether new or modified) is not done until
it has passed a visual code review — actually run the app and look at it, don't just rely
on unit tests or code review of the diff. Unit tests mock RPC/data layers and will not
catch integration-layer breakage (e.g. a Tauri permission/capability misconfiguration that
silently drops all data) or visual drift from the design (missing badges, wrong spacing,
placeholder states that don't match the mockup).

Required steps before calling UI work complete:
1. Actually run the app (`pnpm dev` for the web store; `make dev-gui` for the desktop
   client) with real or realistically seeded data — not just the empty state.
2. Compare rendered screens against the design reference (`docs/ui/Agent Store.dc.html`)
   side by side, screen by screen.
3. For the desktop client specifically, take a real screenshot of the native window
   (e.g. via `screencapture` on macOS) rather than only checking the underlying dev-server
   page in a browser — a plain browser tab has no Tauri IPC bridge, so RPC-backed data and
   real end-to-end behavior can look fine in tests while being silently broken in the
   actual app.
4. Fix any discrepancy found (functional or visual) before reporting the work as done —
   don't defer it to "future polish" without saying so explicitly and getting sign-off.
