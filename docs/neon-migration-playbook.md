# Supabase → Neon 迁移手册（复用版）

> 从 agent-store 的实战迁移（Supabase → **Neon + Neon Auth(managed Better Auth) + Drizzle**）提炼，给标准栈的后续项目当参照。
> 重点记**非显而易见、真花时间的坑**——通用做法一笔带过，坑位详写。
> 前置判断：**能在 prod 上线前迁就在上线前迁**——几乎无数据要搬、无线上会话会断，风险最低。

---

## 0. 总原则

- **分阶段、每阶段一个 PR、每阶段 e2e 卡绿、每阶段可回滚**。顺序：schema → 数据层 → 认证(API→web→桌面) → 合并部署 → 下线 Supabase。
- **迁移期保留双路径**（新旧认证并存于 flag/fallback 之后），验证稳定后在"下线"阶段才删——这是你的回滚保险。
- **test 环境先一直挂在旧栈上**，逐块把新栈做绿再切；不要中途把共享 test 环境切一半。

---

## 1. Neon provisioning

- 建 **test 项目**（免费档，scale-to-zero），**prod 项目押后到上线**（付费档，要备份/稳定性）。同引擎 Postgres = 无环境差异债。
- 认证：`neonctl` 的 OAuth token 存在 `~/.config/neonctl/credentials.json`，可直接 `Bearer` 打 `https://console.neon.tech/api/v2`（列项目要带 `?org_id=`，org id 从 `/users/me/organizations` 取）。
  - ⚠️ **刷新 token 会轮换 refresh_token**——刷新后**必须写回文件**，否则把 CLI 登录搞失效（我踩过：只打印没写回，直接 invalid_grant）。
  - 装 `neonctl` 别假设已装；`npx -y neonctl@latest auth` 最稳。

## 2. 数据层（Drizzle）

- 用 Drizzle **镜像旧的 SQL migration**（表/列/类型/默认值/check/FK/唯一/索引）。**RLS 和 GRANT 是 Supabase/PostgREST 专属——不要照搬**，授权逻辑上移到 API 层（让 Worker 成为唯一 DB 客户端）。
- **触发器 drizzle-kit 不建模**——把 `update_updated_at()` 之类手工追加到生成的 `0000_*.sql` 里（TS-only 的 `$type` 不改 SQL）。
- **类型归一化**：Drizzle 里 `numeric` 返回 **string**、`timestamptz` 返回 **Date**。API 响应形状要保持不变的话，在 mapper 里 `Number(row.rating)` / `date.toISOString()`。
- Cloudflare Workers 用 **neon-http 驱动**（`@neondatabase/serverless` + `drizzle-orm/neon-http`），无状态、每查一次往返，适合 Worker。
- 数据搬运：远端旧库若只能经 MCP 访问，用 `string_agg(quote_literal(...))` 在源端生成 INSERT、`encode(...,'base64')` 输出、本地 `base64 -d | psql` 导入——避免转义地狱。（注意 MCP 返回可能双重 JSON 转义，`\n` 是两字符。）

## 3. 认证（Neon Auth = managed Better Auth）—— 坑最多

**关键事实**
- Neon Auth 底层是 **Better Auth**；session JWT 用 **EdDSA/Ed25519**，走 JWKS 校验；claim 有 `sub`(=user id) + `email`。用 `jose` 的 `createRemoteJWKSet` + `jwtVerify` 校验。
- **GitHub 用户名不是 JWT claim**。Better Auth 只存 `neon_auth.account.accountId`（GitHub 数字 id）。映射到 publisher：`accountId → GitHub GET /user/{id} → login → publisher.slug`（`GET /user/{数字id}` 是真实接口，可反查 login）。

**provider 配置**
- 开 Neon Auth：`POST /projects/{id}/branches/{bid}/auth`，body `{"auth_provider":"better_auth"}`（响应给 base_url + jwks_url，会建 `neon_auth` schema）。
- 配 OAuth provider：`POST .../branches/{bid}/auth/oauth_providers`，body `{"id":"github","client_id":..,"client_secret":..}` → type `standard`。
- ⚠️ **Neon 共享 OAuth 只支持 Google，不支持 GitHub**（`INVALID_SHARED_OAUTH_PROVIDER`）→ GitHub 必须自建 OAuth App（浏览器建，GitHub 无 API 建 OAuth App，实测 `POST /user/oauth_apps` → 404）。
- ⚠️ **`trusted_origins` 无法经管理 API 设**（`PATCH .../auth/config` 只认 `name` 字段，其余静默丢弃）。**直接 SQL 改 `neon_auth.project_config.trusted_origins`（jsonb）——http 源会被 auth 服务读取生效；自定义 scheme(`app://`) 不行**。生产域名务必加进去，否则登录报 `INVALID_CALLBACKURL`。

**web（Next.js）接入**
- SDK：`@neondatabase/auth`（beta）。**同域 proxy** 解决跨域 cookie：`app/api/auth/[...path]/route.ts` 里 `createNeonAuth(cfg).handler()` 转发到远端 neonauth，session cookie 落在自己域名。
- ⚠️ **beta SDK 类型/运行时不一致**：`authApiHandler`/`neonAuthMiddleware` 是**仅类型、无运行时导出**——必须走 `createNeonAuth(...).handler()/.middleware()`。vanilla `createAuthClient(url)`（主入口）在 Node 里超时——用 `/next` 的同域入口。
- ⚠️ **懒实例化 `auth`**：`createNeonAuth()` 在 import 时会因缺 cookie secret 抛错，`next build`（收集 `/api/auth` 路由）直接挂。做成 `auth()` memoized getter，首个请求才建。
- OAuth 回调落回 `?neon_auth_session_verifier=<token>`，客户端 `getSession()` 消费它换同域会话。**回调后要整页跳转**（`window.location`）而非客户端路由——否则根 layout 不在服务端重渲染,nav 停在登出态。
- 调 API 的 JWT 从 **`/api/auth/token`** 取（不是 `get-access-token`，那个 404）。
- ⚠️ **登出要带空 body `{}`**——Better Auth 的 sign-out 对 `application/json` 空 body 报 `FST_ERR_CTP_EMPTY_JSON_BODY` 400。
- ⚠️ 装 SDK 会拉 `core-js`，pnpm 往 `pnpm-workspace.yaml` 的 `allowBuilds` 写占位符 `core-js: set this to true or false`，会让 `next dev` 的 pnpm 预检失败——**设 `core-js: false`**。

**桌面（Tauri）接入**
- ⚠️ **Neon Auth 拒绝自定义 scheme 回调**（`agent-store://` → `INVALID_CALLBACKURL`）**且不认 raw bearer session token**（`/token` 带 `Authorization: Bearer <session>` → 401）。所以旧的 Supabase 自定义 scheme PKCE 流程搬不过来。
- 方案 = **web-relay**：桌面开系统浏览器到 store 的 `/auth/desktop?provider=x` → 那页跑 Better Auth 登录、取 JWT、`deep-link agent-store://auth-callback?token=<JWT>` 回桌面。浏览器还持有 store 会话时可静默刷新。局限：JWT ~10min，需重开 relay 刷新（除非 Neon 开 bearer 插件）。

## 4. 实盘切换

- worker secret：`wrangler secret put`（API worker：`DATABASE_URL` + `NEON_AUTH_JWKS_URL`；store worker：`NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET`，secret ≥32 字符）。
- opennext/Cloudflare 的 store 运行时 env 来自 store worker 的 wrangler secret，不是构建 env。
- 切完再删旧 secret + 依赖；`wrangler secret delete` 偶发 `fetch failed`，重试即可。

## 5. 下线 Supabase

- 删三端 `@supabase/*` 依赖、API 的 auth fallback、`src/supabase.ts`、`SUPABASE_*`（env 示例 / wrangler 注释 / workflow）、worker secret。
- **保留**：`supabase/migrations/`（schema 溯源）；Supabase 项目按需保留做备份，或控制台手动 Delete（MCP 只能 pause 不能 delete）。

## 6. 流程与协作坑

- **stacked PR + 分支保护"require up-to-date"**：合并栈要 bottom-up，每个先 `gh pr update-branch` → 等 e2e → 合并；前一个合并后手动把下一个 `--base main` 重定向。
- **e2e 跑真 LLM agent 会 flaky**（agent 偶尔答非所问）——重跑 flaky 失败 ≠ bypass 门禁。**不要 `--admin` 硬合**。
- ⚠️ **改文件的 subagent 必须 `isolation: "worktree"`**——共享工作目录的 agent 切了我的分支、把工作树回退到旧代码（远端/部署没受影响,但很吓人）。只读 sweep/审计可共享目录。
- ⚠️ **gh 双 token**：会话注入的 `GH_TOKEN`（env）可能缺 `workflow` scope，覆盖了 keyring 里带全权限的那个。推工作流文件用 `env -u GH_TOKEN git push`（fallback 到 keyring token）。`gh auth refresh` 对 env 注入的 token 无效。
- 完成定义：每阶段 lint/type-check/测试绿 + 改了架构就同步文档。
