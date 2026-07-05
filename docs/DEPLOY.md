# 开发与部署 Runbook（本地 / 线上测试 / 线上生产）

三套环境，操作与配置不同。详见 skill `indie-deploy` 与
`docs/superpowers/specs/2026-07-05-deployment-dual-region.md`。

---

## A. 本地开发环境（已就绪，一条命令起）

前提：Docker 运行中；已有 `apps/store/.env.local`（本地 Supabase 的 URL + anon key，`supabase status` 可查）。

| 命令 | 起什么 | 端口 |
|---|---|---|
| `make dev-gui` | 本地 Supabase + 目录 API(apps/api) + 桌面客户端(Tauri)，客户端经 `AAS_STORE_URL` 指向本地 API | DB 54321 / API 3001 / app 窗口 |
| `make dev-api` | 本地 Supabase + 目录 API | API 3001 |
| `make dev` | 本地 Supabase + Web 商店(next dev) | web 3000 |
| `make seed` | 重置本地 DB 并灌 seed（`supabase/seed.sql`，含 local/yls/skyapi） | — |

- 数据可随意重置：`make seed`。
- 本地 API 冒烟：`curl "http://127.0.0.1:3001/api/items?category=provider"`。
- 本地绝不连云端；密钥只在 `.env.local`（已 gitignore）。

---

## B. 线上测试环境（代码已就绪，等执行）

代码侧已完成：`apps/api` 可上 Cloudflare Workers（`src/worker.ts` + `wrangler.toml` 的 `[env.test]`，`wrangler --dry-run` 打包已验证）；CLI 用 `AAS_STORE_URL` 指向线上；web 的 `next build` 阻塞已修。

三个 MCP（supabase / cloudflare / vercel）已安装并授权（`claude mcp list` 显示 ✔ Connected）。

### 执行前唯一的前置动作（需你操作）
**重启 Claude Code 会话**——会话中途新增的 MCP 工具不会加载进当前会话，重启后我才能用 `supabase / cloudflare / vercel` 的 MCP 工具驱动部署。

### 重启后我会依次执行（B1→B4）
1. **Supabase 测试项目**（MCP）：建 `agent-store-test`（Singapore 区）→ 推 migration + seed → 取 URL/anon/service key。
2. **API 上 Workers**（MCP 或 `wrangler`）：
   ```bash
   cd apps/api
   wrangler secret put SUPABASE_URL --env test        # 填测试项目 URL
   wrangler secret put SUPABASE_ANON_KEY --env test    # 填测试项目 anon key
   wrangler deploy --env test                          # → aas-api-test.<subdomain>.workers.dev
   curl "https://aas-api-test.<subdomain>.workers.dev/api/items?category=provider"
   ```
3. **Web 上 Vercel**（MCP）：link 项目 → 设环境变量（测试 Supabase + 测试 API URL）→ 部署 preview。
4. **验证**：curl Workers URL 返回真实种子数据；web preview 打开；`AAS_STORE_URL=<worker url> bun run apps/cli/src/index.ts __rpc search '[""]'` 能搜到 local/yls/skyapi。

### CLI 兜底（若 MCP 工具仍加载不出）
```bash
# 你用 ! 在会话里登录：
! supabase login
! bunx wrangler login
! bunx vercel login
```
然后我用 CLI 完成 B1–B4。

---

## C. 线上生产环境（后续完善）
独立 `agent-store-prod` Supabase 项目（无 seed、真实数据、谨慎迁移）；`wrangler deploy --env production`；Vercel Production；自定义域 + Cloudflare 代理；CI/CD（GitHub Actions）；桌面端分发（Releases + R2 镜像 + Tauri updater + 签名）。
