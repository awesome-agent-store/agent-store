# Handoff: Agent Store (Web Store + CLI Client)

## Overview
Agent Store is a registry / marketplace for AI-agent extensions — **Skills**, **MCP servers**, and model **Providers** — for coding agents like Claude Code and Codex. It has two surfaces that share one backend and account system:

1. **Web Store** — a Raycast-style marketplace where users browse, search, favorite, inspect, and publish resources. Rendered inside a mock browser window.
2. **CLI Client** — a desktop app (mock macOS window) for managing which resources are installed into each local agent (`~/.claude`, `~/.codex`), editing provider configs, enabling/disabling per-app, and watching a live terminal log.

A top segmented switcher toggles between the two surfaces, plus a light/dark theme toggle.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the intended look and behavior, **not production code to copy directly**. `Agent Store.dc.html` is a "Design Component" authored in a bespoke templating runtime (`support.js`); do not ship that runtime. The task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries. If no environment exists yet, choose the appropriate stack per surface:
- **Web Store** → React/Next.js + a backend (Supabase is assumed throughout — see data model notes).
- **CLI Client** → Tauri (Rust) or Electron desktop app; the "install" actions write to real agent config files (`~/.claude/settings.json`, `~/.codex/config.toml`) and a local proxy handles provider model-name rewriting/mapping.

The `.dc.html` file is fully self-documenting for **exact colors, spacing, typography, copy, and interaction logic** — open it and read the `<style>` `:root` block (tokens), the template markup (layout), and the `class Component` logic (state + behavior).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, iconography, and interactions are all specified. Recreate the UI pixel-perfectly using the codebase's component library. All copy is in **Simplified Chinese** with a built-in **English** i18n path (see State → uiLang).

---

## Design Tokens

Defined as CSS custom properties in `:root` (dark, default) and `[data-theme="light"]`. Recreate as theme objects.

### Dark theme (default)
| Token | Value | Use |
|---|---|---|
| `--wall` | `radial-gradient(130% 120% at 26% -12%, #2c2647 0%, #16161c 52%, #0b0b0f 100%)` | app backdrop |
| `--win` | `#17171b` | window body |
| `--sidebar` | `#1e1e24` | sidebars |
| `--content` | `#141417` | content panes |
| `--chrome` | `#1e1e24` | window chrome / title bars |
| `--panel` | `#23232a` | cards, inputs |
| `--panel-2` | `#2b2b32` | nested panels |
| `--border` | `rgba(255,255,255,0.08)` | hairlines |
| `--border-strong` | `rgba(255,255,255,0.15)` | emphasized borders |
| `--text` | `#edeef1` | primary text |
| `--text-2` | `#9a9aa6` | secondary text |
| `--text-3` | `#64646e` | tertiary/muted |
| `--accent` | `#7c82ff` | primary action (indigo) |
| `--accent-soft` | `rgba(124,130,255,0.16)` | accent tint |
| `--green` | `#3ad29f` | success / installed |
| `--amber` / `--star` | `#f0b34a` | warnings / rating stars |
| `--red` | `#f3675f` | destructive / favorite heart |
| `--term-bg` | `#0c0c10` | terminal background |
| `--shadow` | `0 34px 90px rgba(0,0,0,0.62)` | window shadow |

### Light theme (overrides)
`--win #ffffff` · `--sidebar #f4f4f7` · `--content #fbfbfc` · `--chrome #ececf0` · `--panel #ffffff` · `--panel-2 #f5f5f8` · `--border rgba(0,0,0,0.09)` · `--text #191920` · `--text-2 #5d5d68` · `--text-3 #9797a2` · `--accent #5b54e8` · `--green #16a06a` · `--red #e0483f` · `--shadow 0 34px 90px rgba(0,0,0,0.22)`.

### Typography
- **Sans (UI):** `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif`
- **Mono (code, URLs, IDs, terminal):** `'JetBrains Mono', ui-monospace, 'SF Mono', monospace` (Google Font, weights 400–700)
- Common sizes: window titles 15px/750, section headers 13–15px/650–750, body 12.5–13px, meta/labels 9.5–12px, mono chips 11–12px. Letter-spacing −0.1 to −0.3px on headings.

### Shape & motion
- Radii: windows 14px, cards/panels 10–12px, buttons 8–11px, pills/chips 6–8px, avatars 50%.
- Keyframes: `omFade` (.14s overlay fade), `omDrawer` (30px slide-in for right drawers), `omPop` (modal pop, translateY+scale), `omBlink` (terminal cursor).

### Type accent colors (resource categories)
- **skill** → green `#3ad29f` (label 技能, meta "大小")
- **mcp** → amber `#f0b34a` (label MCP, meta "工具")
- **provider** → blue `#58a6f0` (label 供应商, meta "延迟")

### Publisher tiers
- **official** 官方 → amber `#f0b34a`
- **verified** 已验证 → blue `#58a6f0`
- **community** 社区 → gray `#8b8b96`

---

## Screens / Views

Both windows are fixed **1200 × 764px**, 14px radius, `--shadow`, centered on `--wall`.

### 1. Top Switcher (persistent)
Centered pill toolbar above the window: segmented control with **"Web 端 · Store"** (globe icon) and **"CLI 客户端"** (terminal icon); active segment gets `--panel` bg + `--text` fg, inactive is transparent + `--text-2`. To its right, a 40×40 theme-toggle button showing ☀️/🌙.

### 2. Web Store
**Chrome:** browser bar (3 traffic-light dots, centered address pill showing 🔒 `agent-store.dev` + mono url path).
**App header (64px):** indigo logo tile (cube glyph) + "Agent Store" / "registry for AI agents" mono subtitle; nav "探索 / 文档"; indigo **发布** (publish) button with + icon; circular gradient avatar "Y" (opens publisher profile / "me").

**Body = main scroll + right rail:**
- **Featured carousel** (auto-advances every 5s; pauses when any overlay is open, when tab hidden, or on CLI surface). Cycles `superpowers → pdf-processing → frontend-design`. Rotating badges: 本周精选 / 编辑推荐 / 热门上升. Prev/next arrows + dot indicators; manual nav restarts the 5s timer.
- **Category tabs:** 探索(all) / 供应商 / 技能 / MCP.
- **Sort:** 全部 / 最近新增 / 最流行 / 评分最高.
- **Search** input (filters by id/desc/tags).
- **Resource grid/list** of cards. Each card: type icon + name, publisher + tier badge, star rating (★ glyphs) + review count, download count, version, short desc, tag chips, favorite heart (toggles red fill), and Install/Installed state.

**Overlays (all animate in, click-scrim to close):**
- **Detail drawer** (right, `omDrawer`, z40): full resource detail with tabs (readme / config / reviews-style content), install action, favorite, publisher link. Provider details show supported models; MCP shows transport + command/url/headers.
- **Publisher profile drawer** (right, z45): author info, tier, their published resources.
- **Publish modal** (center, `omPop`, z50): type selector (technic/skill/mcp/provider) driving a **dynamic field schema** (see FIELD_SCHEMAS below), with conditional fields.

### 3. CLI Client
**Title bar:** full-width macOS bar — traffic-light dots at left, centered title **"Agent Store CLI"**.
**Layout:** left nav sidebar (sections: installed / browse / updates / favorites, with icons) + agent-app switcher (**Claude Code** `~/.claude`, **Codex** `~/.codex`) → main list of installed resources → live **terminal** pane at bottom (`--term-bg`, mono, colored lines, blinking cursor).
- Each installed row: name, version, per-app enable toggle, update badge if outdated, uninstall.
- Actions push colored lines into the terminal (e.g. `$ agent-store install …` → green `✓ 已安装 …`).
- **Provider edit modal** (z60): edit provider config — name, baseUrl, apiKey, endpoint, upstream protocol, auth type, custom header, icon, level, **model whitelist**, **model mapping (from→to)**, health check toggle. Also "duplicate provider" support (creates `-copy` variants).
- **Settings modal** (z60): tabs incl. **account** (logged-in state) and **language** — language menu with 中文 / English enabled, 日本語/한국어/Español "即将支持" disabled. Switching language runs a live DOM i18n walk.

---

## Interactions & Behavior
- **Surface switch** via top segmented control (`surface: 'web' | 'cli'`).
- **Theme toggle** flips `theme` and the `data-theme` attribute; all colors are token-driven.
- **Featured carousel:** `setInterval` 5000ms, guarded by `!document.hidden && surface==='web' && !anyOverlay`. Manual prev/next/dot restarts the timer. Index is modulo over available featured ids.
- **Favorite:** toggles `favorites[id]`; heart fills red.
- **Install / Uninstall / Enable-disable / Update / Update-all:** mutate `installed[id]` and append lines to the terminal log. Enable/disable is **per agent app** (`apps: {claude, codex}`).
- **Publish:** type selection swaps the visible field set; conditional fields via `when(vals)` predicates; on confirm, a new package is prepended to `userPkgs` and appears in the store.
- **Duplicate provider:** clones config under a unique `-copy` id.
- **i18n:** `uiLang: 'zh' | 'en'`; a DOM-walk translator swaps text on change (in a real app, use a proper i18n library with keyed strings instead of DOM walking).
- Overlays: fade scrim + slide/pop content; **click on scrim closes**; drawers slide from right.

## State Management
Top-level state (see `state = {…}` in the logic class):
- `surface`, `theme`
- `web`: `{ cat, q, sel, detailTab, profile, verified, sort }`
- `publishOpen`, `pform: { type, vals }`
- `settingsOpen`, `settingsTab`, `loggedIn`, `uiLang`, `langMenuOpen`
- `favorites: { [id]: true }`
- `userPkgs`, `dupPkgs` (published + duplicated resources, merged ahead of `BASE_PKGS`)
- `cli`: `{ app, section, appMenuOpen, filter, listFilter, filterMenuOpen }`
- `installed: { [id]: { ver, apps:{claude,codex}, config? } }` — `config` present for providers
- `cliEditId`, `cliEditVals` (provider edit modal working copy)
- `term: [{ text, color }]` (terminal log lines)

Helpers: `allPkgs()`, `pkg(id)`, `decorate(pkg)` (adds tier/status/installed/faved display fields), `reviewsFor()`, `installCmd()`, `duplicateProvider()`.

---

## Data Model (maps to Supabase — recreate as real tables/APIs)

### `items` (packages) — see `BASE_PKGS`
Fields per item: `id`, `type` (`skill|mcp|provider`), `author`, `verified`, `dl` (downloads), `rating`, `reviews`, `ver`, `meta` (type-specific: size / tool-count / latency), `tags[]`, `desc`.
Type-specific metadata (Supabase `items.metadata` JSONB):
- **provider** → `PROVIDER_MODELS[id]` = supported model list.
- **mcp** → `MCP_META[id]` = `{ transport: stdio|sse|http, serverCommand | url + headers }`.
- **skill** → `contentUrl` (zip download).

### `publishers`
`author` + `tier` (`official|verified|community`) via `PUBLISHER_TIER`.

### `installed` (per-user, per-agent — CLI writes to local agent config)
`{ id → { ver, apps:{claude,codex}, config } }`. Provider `config` shape:
`{ name, provider, baseUrl, homepage, apiKey, endpoint, upstreamProtocol, authType, customHeader, icon, level, whitelist[], mapping[], healthCheck }`.

### Publish field schemas — `FIELD_SCHEMAS`
Dynamic form per resource type:
- **provider:** name, homepage, baseUrl, supportedModels (comma list).
- **skill:** name, repo, contentUrl, category(select), installMethod(select), installScript(conditional).
- **mcp:** name, homepage, transport(select), command(when stdio), url(when sse/http), headers(when sse/http), env(when stdio).

### Reference lists
- `APPS`: Claude Code (`~/.claude`, `#d2785a`), Codex (`~/.codex`, `#10a37f`).
- `CATS`, `SORTS`, `TIERS`, `TYPE`, `LANGS` (zh/en enabled; ja/ko/es coming soon), `REVIEW_POOL`, `AVATAR_COLORS`.

## Assets
No external images — all icons are inline SVG (see `icon(type)` and the template's inline `<svg>` blocks: provider/skill/mcp/fav/browse/updates/all, plus logo cube, globe, terminal, search, lock, plus). Recreate with the codebase's icon system or an icon library. Only external asset: **JetBrains Mono** from Google Fonts.

## Files
- `Agent Store.dc.html` — the complete design (template + logic + tokens). The single source of truth.
- `support.js` — the prototype runtime (reference only; **do not ship**). Included so the HTML opens in a browser for visual reference.

To preview: open `Agent Store.dc.html` in a browser.
