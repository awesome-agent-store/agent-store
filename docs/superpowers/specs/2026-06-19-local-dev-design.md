# Local Development & E2E Testing Design

## 1. 目标

在本地跑通完整的 CLI → SDK → Market → Supabase 链路，验证安装、启用、同步流程，同时不影响本机真实的 Claude 和 Codex 配置。

## 2. 架构

```
[Supabase 本地栈]    [Market Next.js]    [CLI (主机)]
 localhost:54321  →   localhost:3000  ←  bin/aas
 (supabase start)     (pnpm dev)          AAS_HOME=/tmp/aas-e2e
 Docker 内部           主机进程             CLAUDE_CONFIG_DIR=/tmp/claude-e2e
                                          CODEX_CONFIG_DIR=/tmp/codex-e2e
```

- **Supabase 本地栈**：通过 Supabase CLI (`supabase start`) 管理，内部使用 Docker，对外暴露 `localhost:54321`
- **Market**：`pnpm dev` 直接跑在主机，读 `.env.local` 中的本地 Supabase 凭证
- **CLI**：主机直接运行 `bin/aas`，SDK 默认 `baseUrl = http://localhost:3000` 无需任何改动；路径环境变量全部重定向到 `/tmp` 隔离目录

## 3. 文件结构变化

```
ai-agent-store/
├── Makefile                          ← 新建
├── supabase/                         ← 新建（repo 根目录）
│   ├── config.toml                   ← supabase init 生成
│   ├── migrations/
│   │   └── 001_initial.sql           ← 从 apps/market/supabase/migrations/ 移过来
│   └── seed.sql                      ← 新建，3 个测试 item
├── scripts/
│   └── local-e2e.sh                  ← 新建，端到端验证脚本
└── apps/market/
    ├── .env.local                    ← 新建（gitignored），本地 Supabase 凭证
    └── .gitignore                    ← 追加 .env.local
```

`apps/market/supabase/migrations/` 目录在迁移完成后删除（保留 `apps/market/supabase/` 目录入口以便 supabase CLI 仍能从 market 目录引用，但实际文件移到根目录）。

## 4. Supabase 本地栈

### 安装与初始化（一次性）

```bash
brew install supabase/tap/supabase
supabase init          # 在 repo 根目录生成 supabase/config.toml
supabase start         # 启动 Docker 容器（首次拉取镜像较慢）
supabase db reset      # 应用 migrations/ + seed.sql
```

### 本地凭证（`supabase status` 输出）

```
API URL:          http://localhost:54321
anon key:         eyJ...
service_role key: eyJ...
Studio URL:       http://localhost:54323
```

### `apps/market/.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

## 5. 测试数据（supabase/seed.sql）

### Publisher

| 字段 | 值 |
|---|---|
| slug | `test-co` |
| name | `Test Co` |
| tier | `official` |

### Item 1: openai-provider-test（provider）

- `compatibleWith`: `['claude', 'codex']`
- `version`: `1.0.0`
- `status`: `published`
- `installHook.steps`:
  ```json
  [{ "type": "config", "patch": { "apiKey": "", "model": "gpt-4o" } }]
  ```
- `metadata.configSchema`:
  ```json
  {
    "type": "object",
    "required": ["apiKey"],
    "properties": {
      "apiKey": { "type": "string", "description": "OpenAI API Key" },
      "model":  { "type": "string", "description": "Model", "default": "gpt-4o" }
    }
  }
  ```
- `metadata.supportedModels`: `["gpt-4o", "gpt-4o-mini"]`
- enable 效果：写入 `$CLAUDE_CONFIG_DIR/settings.json` 的 `providers.openai-provider-test`

### Item 2: hello-skill（skill）

- `compatibleWith`: `['claude']`
- `version`: `1.0.0`
- `status`: `published`
- `installHook.steps`:
  ```json
  [{ "type": "script", "command": "printf '# Hello Skill\\n\\nA test skill for local E2E.\\n' > skill.md" }]
  ```
- enable 效果：复制 `skill.md` 到 `$CLAUDE_CONFIG_DIR/skills/hello-skill.md`

### Item 3: fs-mcp-test（mcp）

- `compatibleWith`: `['claude']`
- `version`: `1.0.0`
- `status`: `published`
- `installHook.steps`:
  ```json
  [
    { "type": "script", "command": "printf '#!/bin/sh\\necho hello\\n' > server && chmod +x server" },
    { "type": "config", "patch": { "allowedPaths": ["/tmp"] } }
  ]
  ```
- `metadata.transport`: `stdio`
- `metadata.serverCommand`: `./server`（resolveServerCmd 会转为 itemDir 绝对路径）
- enable 效果：写入 `$CLAUDE_CONFIG_DIR/settings.json` 的 `mcpServers.fs-mcp-test`

## 6. 路径隔离

E2E 测试期间设置以下环境变量，所有 `aas` 命令写入 `/tmp` 下的隔离目录，不影响真实配置：

| 环境变量 | E2E 期间值 | 真实默认值 |
|---|---|---|
| `AAS_HOME` | `/tmp/aas-e2e` | `~/.agents` |
| `CLAUDE_CONFIG_DIR` | `/tmp/claude-e2e` | `~/.claude` |
| `CODEX_CONFIG_DIR` | `/tmp/codex-e2e` | `~/.codex` |

`make e2e` 在脚本开始前创建这些目录，结束后清理。

## 7. E2E 验证脚本（scripts/local-e2e.sh）

```bash
#!/usr/bin/env bash
set -euo pipefail

export AAS_HOME=/tmp/aas-e2e
export CLAUDE_CONFIG_DIR=/tmp/claude-e2e
export CODEX_CONFIG_DIR=/tmp/codex-e2e

# 清理并重建隔离目录
rm -rf "$AAS_HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_CONFIG_DIR"
mkdir -p "$AAS_HOME" "$CLAUDE_CONFIG_DIR/skills" "$CODEX_CONFIG_DIR"

AAS=./bin/aas

echo "=== search ==="
$AAS search test

echo "=== install ==="
$AAS install openai-provider-test
$AAS install hello-skill
$AAS install fs-mcp-test

echo "=== list (all disabled) ==="
$AAS list

echo "=== enable ==="
$AAS enable openai-provider-test --for claude
$AAS enable hello-skill --for claude
$AAS enable fs-mcp-test --for claude

echo "=== list (all enabled) ==="
$AAS list

echo "=== sync (idempotency) ==="
$AAS sync

echo "=== verify ==="
grep -q "openai-provider-test" "$CLAUDE_CONFIG_DIR/settings.json" \
  && echo "✓ provider in claude settings" \
  || (echo "✗ provider missing" && exit 1)

grep -q "fs-mcp-test" "$CLAUDE_CONFIG_DIR/settings.json" \
  && echo "✓ mcp in claude settings" \
  || (echo "✗ mcp missing" && exit 1)

[ -s "$CLAUDE_CONFIG_DIR/skills/hello-skill.md" ] \
  && echo "✓ skill.md exists" \
  || (echo "✗ skill.md missing" && exit 1)

echo ""
echo "✓ All checks passed"

# 清理
rm -rf "$AAS_HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_CONFIG_DIR"
```

## 8. Makefile

```makefile
.PHONY: setup seed dev build-cli e2e stop status

setup:
	brew install supabase/tap/supabase
	supabase init
	supabase start
	$(MAKE) seed

seed:
	supabase db reset

dev:
	supabase start
	pnpm --filter=@aas/market dev

build-cli:
	pnpm --filter=@aas/cli build:bin

e2e: build-cli
	@./scripts/local-e2e.sh

stop:
	supabase stop

status:
	supabase status
```

## 9. 日常工作流

**首次设置（一次性）：**
```bash
make setup        # 安装 CLI、初始化、启动 Supabase、注入 seed 数据
# 手动复制 .env.local 并填入 make status 输出的凭证
```

**日常开发：**
```bash
make dev          # 启动 Supabase（已运行则无操作）+ market dev server
```

**运行 E2E 测试：**
```bash
make e2e          # 编译 CLI binary + 跑隔离测试 + 自动清理
```

**重置数据：**
```bash
make seed         # 清空 DB 并重新注入 seed 数据
```

**停止本地栈：**
```bash
make stop
```

## 10. 生产部署（测试通过后）

本地测试通过的唯一差异点：

| 项 | 本地 | 生产 |
|---|---|---|
| Supabase URL | `http://localhost:54321` | `https://<project>.supabase.co` |
| Market URL | `http://localhost:3000` | `https://<domain>` |
| CLI market URL | 默认 `localhost:3000` | 需要配置 `AAS_MARKET_URL` 或重新编译 |
| 部署方式 | 本地进程 | Vercel（market）+ Supabase 云（DB） |

生产部署时，CLI 通过 `AAS_MARKET_URL` 环境变量或 `--market-url` flag 切换 market 地址（此功能在生产部署计划中实现）。
