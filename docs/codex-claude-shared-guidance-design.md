# Codex / Claude Shared Guidance Design

## Goal

Design one shared guidance and skill layout that works across both Codex and Claude Code while keeping duplication close to zero.

The design should:

- keep one canonical copy of shared `AGENTS.md` content
- keep one canonical copy of shared skills
- preserve directory-scoped inheritance for both tools
- allow temporary tool-specific overrides without forking the shared source permanently

## Decision

Use a **shared fact source plus native symlink adapters**:

- shared rules live in `AGENTS.md`
- shared skills live in `.agents/skills` and `~/.agents/skills`
- `CLAUDE.md` files are symlinks to the matching `AGENTS.md`
- `.claude/skills` entries are symlinks to the matching `.agents/skills` entries

This keeps the real content in one place while exposing each tool's native discovery paths.

## Why This Design

Codex and Claude Code do not share the same native file names or skill directories:

- Codex uses `AGENTS.md` and supports `.agents/skills` and `~/.agents/skills`
- Claude Code uses `CLAUDE.md`, `CLAUDE.local.md`, `.claude/skills`, and `~/.claude/skills`

If both sides are maintained independently, they will drift. The only stable way to avoid drift is:

1. pick one canonical source
2. map each tool's native entrypoints to that source

`AGENTS.md` is the better canonical source because:

- it is already the shared naming convention across multi-agent tooling
- Codex uses it natively
- Claude Code officially supports importing or linking to `AGENTS.md` through `CLAUDE.md`

## Canonical Sources

### Global

```text
~/.agents/AGENTS.md
~/.agents/skills/
```

### Repository

```text
<repo>/AGENTS.md
<repo>/.agents/skills/
```

### Subtree

Any directory that needs its own scoped rules gets its own canonical `AGENTS.md`:

```text
<repo>/packages/api/AGENTS.md
<repo>/apps/web/AGENTS.md
```

## Adapter Layer

### Global adapters

```text
~/.codex/AGENTS.md          -> ~/.agents/AGENTS.md
~/.claude/CLAUDE.md         -> ~/.agents/AGENTS.md
~/.claude/skills/<skill>    -> ~/.agents/skills/<skill>
```

### Repository adapters

```text
<repo>/CLAUDE.md              -> AGENTS.md
<repo>/.claude/skills/<skill> -> ../.agents/skills/<skill>
```

### Subtree adapters

Every directory that contains a scoped `AGENTS.md` should also contain:

```text
<dir>/CLAUDE.md -> AGENTS.md
```

This keeps Codex and Claude Code aligned on the same scope boundaries.

## Inheritance Model

### Codex

Codex behavior is:

1. load user-level guidance from `~/.codex/AGENTS.md`
2. determine the project root
3. load every `AGENTS.md` from project root down to the current working directory

Because the Codex global entrypoint is a symlink to `~/.agents/AGENTS.md`, the effective global source remains shared.

### Claude Code

Claude Code behavior is:

1. load user-level guidance from `~/.claude/CLAUDE.md`
2. walk upward from the working directory through parent directories
3. load `CLAUDE.md` files found on that path
4. load deeper subdirectory `CLAUDE.md` files on demand when reading files there

Because every `CLAUDE.md` is a symlink to the matching `AGENTS.md`, Claude Code sees the same scoped rule content as Codex.

### Practical result

With this layout:

- shared content is authored once
- both tools inherit along their own native algorithms
- the visible scope boundaries stay equivalent because each scoped `AGENTS.md` has a matching `CLAUDE.md` symlink

## Example Layout

```text
~/.agents/
  AGENTS.md
  skills/
    review-code/
    write-plan/

~/.codex/
  AGENTS.md -> ~/.agents/AGENTS.md

~/.claude/
  CLAUDE.md -> ~/.agents/AGENTS.md
  skills/
    review-code -> ~/.agents/skills/review-code
    write-plan -> ~/.agents/skills/write-plan

repo/
  AGENTS.md
  CLAUDE.md -> AGENTS.md
  .agents/
    skills/
      repo-test/
  .claude/
    skills/
      repo-test -> ../.agents/skills/repo-test
  packages/
    api/
      AGENTS.md
      CLAUDE.md -> AGENTS.md
    web/
      AGENTS.md
      CLAUDE.md -> AGENTS.md
```

## Rules For Authors

### Shared rules

- Write all durable shared guidance in `AGENTS.md`
- Do not put long-lived shared rules directly in `CLAUDE.md`
- Treat `CLAUDE.md` as an adapter file, not a source file

### Shared skills

- Create new shared skills only in `.agents/skills` or `~/.agents/skills`
- Do not duplicate skill source into `.claude/skills`
- `.claude/skills` should only contain symlinks

### Scoped directories

- If a directory needs its own guidance scope, add both `AGENTS.md` and `CLAUDE.md -> AGENTS.md`
- Do not create a subtree-specific `CLAUDE.md` without the matching canonical `AGENTS.md`

## Exceptions And Escape Hatches

### Codex temporary global override

Use:

```text
~/.codex/AGENTS.override.md
```

This is for short-lived experiments only. Remove it when done.

### Claude temporary local override

Use:

```text
CLAUDE.local.md
```

This is also for short-lived local exceptions only. Do not move durable shared guidance into it.

### Tool-specific behavior

If a rule is truly tool-specific and cannot be shared:

- keep the shared baseline in `AGENTS.md`
- put the minimum possible delta in the tool-specific escape hatch
- document why the split exists

The default assumption should still be "shared unless proven otherwise".

## Non-Goals

This design does not attempt to:

- force both tools to use the same internal inheritance algorithm
- create subtree-level skill inheritance
- make `~/.agents/AGENTS.md` directly auto-discoverable by both tools

Important: `~/.agents/AGENTS.md` is the canonical source by convention in this design, not a native global entrypoint recognized automatically by both tools. Native discovery still happens through:

- `~/.codex/AGENTS.md` for Codex
- `~/.claude/CLAUDE.md` for Claude Code

## Migration Plan

1. Create the canonical global sources:
   - `~/.agents/AGENTS.md`
   - `~/.agents/skills/`
2. Create the global adapters:
   - `~/.codex/AGENTS.md -> ~/.agents/AGENTS.md`
   - `~/.claude/CLAUDE.md -> ~/.agents/AGENTS.md`
   - `~/.claude/skills/* -> ~/.agents/skills/*`
3. In each repository:
   - choose `<repo>/AGENTS.md` as the canonical repo rule file
   - create `<repo>/CLAUDE.md -> AGENTS.md`
   - choose `<repo>/.agents/skills/` as the canonical repo skill directory
   - create `<repo>/.claude/skills/* -> <repo>/.agents/skills/*`
4. For each scoped subtree:
   - keep real content in `<dir>/AGENTS.md`
   - create `<dir>/CLAUDE.md -> AGENTS.md`
5. Remove duplicated rule text from legacy `CLAUDE.md` files after verifying the shared source covers it

## Operational Checks

After setup, verify:

1. Codex sees the expected global and repo `AGENTS.md` chain
2. Claude Code sees the expected `CLAUDE.md` chain through symlinks
3. Codex can discover `~/.agents/skills` and repo `.agents/skills`
4. Claude Code can discover `~/.claude/skills` and repo `.claude/skills`
5. Temporary overrides remain empty or absent during normal operation

## Recommendation

Adopt this as the default cross-agent standard:

- `AGENTS.md` is the single source of truth for shared guidance
- `.agents/skills` is the single source of truth for shared skills
- `CLAUDE.md` and `.claude/skills` are compatibility adapters
- use tool-specific override files only for short-lived local exceptions

This gives the lowest long-term maintenance cost while staying inside each tool's native discovery model.
