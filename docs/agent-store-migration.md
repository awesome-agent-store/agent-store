# agent-store 迁移记录：Supabase → 标准栈

> 把 agent-store 从 Supabase 迁到 [`standard-stack.md`](./standard-stack.md)（Neon + Better Auth + Drizzle），作为标准栈的**第一个样本**，迁完即成新产品 starter 模板。
> **状态（2026-07）**：迁移**基本完成**，test 环境已**实切到 Neon**（三端 e2e 绿）。Phase 0/1/2 已落地（PR #7–#12），本文由"前瞻计划"改写为"迁移记录"。剩 Phase 3（下线 Supabase + 建 prod `agent-store` Neon 项目）押后待办。
> **时机说明**：迁移选在 prod 尚未上线（Waffo 未过 KYB、无真实用户数据/会话）的窗口做——几乎无数据要搬、无线上会话会断，事后回看这个判断成立。

**进度图例**：✅ 已完成　🔜 待办（Phase 3）

## 1. 迁移起点（Supabase 咬合面）

盘点自 2026-07-10 代码，作为迁移前的存档基线。分四块：

### API（`apps/api`）
| 文件 | 用途 |
|---|---|
| `src/supabase.ts` | Supabase client 工厂（service-role + anon） |
| `src/auth.ts` | `getAuthUser` → `supabase.auth.getUser(token)` 校验 JWT |
| `src/queries.ts` / `subscription-queries.ts` / `publisher-items.ts` | 用 supabase-js 读写 DB（service-role） |
| `src/app.ts` | 路由消费以上；Waffo checkout/webhook 与 Supabase 无关 |

### Store（`apps/store`，Next.js）
| 文件 | 用途 |
|---|---|
| `lib/supabase/{client,server}.ts`、`lib/auth.ts` | 浏览器/服务端 Supabase client + `getUser` |
| `middleware.ts` | 刷新 session + `getUser` |
| `app/auth/{login,callback,logout}/route.ts` | GitHub OAuth 登录 / `exchangeCodeForSession` / 登出 |
| `dashboard`、`pricing`、`ReviewsSection`、`UpgradeProButton`、`PublishModal` | 用 `getSession()` 取 access token 调 API |

### 桌面端（`apps/cli-gui`，Tauri）— 最难的一块
| 文件 | 用途 |
|---|---|
| `lib/supabase.ts` | client + `AUTH_REDIRECT_URL = 'agent-store://auth-callback'` |
| `state/Auth.tsx` | `getSession` / `onAuthStateChange` / `signInWithOAuth`(GitHub) / `exchangeCodeForSession` / `signOut` |
| `lib/deepLink.ts` | 接 `agent-store://` 深链（OAuth 回调） |

### DB / RLS
- 5 个 migration：`001_initial`（items/publishers）、`002_subscriptions`、`003_drop_item_icon_readme`、`004_reviews`、`005_item_versions`。
- 表：items、publishers、subscriptions、processed_webhooks、reviews、item_versions。
- RLS 用 `auth.uid()`（Supabase 注入），公开读限 `status='published'`，写限本人。

**起点认证模型**：三端都从 Supabase 拿 session token → 作为 Bearer 调 API → API 用 `supabase.auth.getUser` 校验；RLS 用 `auth.uid()`。数据读写基本都经 API（浏览器不直连库，除认证外），这对迁移有利——事实证明这是本次能平滑切换的关键。

## 2. 目标态（已达成 ✅）

| 起点 | 现状（已切） |
|---|---|
| Supabase Postgres | **Neon**（test 免费项目 `agent-store-test`；prod 同引擎，押后建） |
| Supabase Auth（GitHub OAuth，JWT） | **Neon Auth**（Neon 托管的 Better Auth，用户同步进 Neon 库，GitHub + Google social） |
| `supabase-js` 查询 | **Drizzle**（打 Neon HTTP driver `@neondatabase/serverless`） |
| RLS（`auth.uid()`）做授权 | **API 层做授权**（Worker 是唯一 DB 客户端） |
| 三端 Supabase session | 三端 Better Auth session（Web 同源 handler / 桌面 web-relay 深链） |

## 3. 三个硬骨头（回顾：如何解决的）

1. **桌面 OAuth 深链** ✅ — 结论比预期更麻烦：Neon Auth **既拒绝自定义 scheme 回调，也拒绝把 session token 当裸 Bearer 用**。最终改成 **web-relay**：桌面开系统浏览器进 store 的 `/auth/desktop` 页 → 该页用同源 session 换出一枚 JWT → 深链 `agent-store://auth-callback?token=…` 回传给 app。桌面本地存这枚 JWT，之后作为 Bearer 调 API。见 `apps/store/app/auth/desktop/page.tsx`、`apps/cli-gui/src/lib/neonAuth.ts` + `state/Auth.tsx`。
2. **RLS → API 层授权** ✅ — schema 里**故意不复制** RLS 策略与 anon/authenticated GRANT；授权规则（谁能发评价、谁能读自己的订阅/条目）改写进 API handler（`app.ts` 里各路由先 `getAuthUser` 再校验归属）。因为浏览器本就不直连库，这步是"把隐式的 DB 规则显式化到代码"，并补了 API 层授权测试。
3. **三端换 session 来源** ✅ — API `getAuthUser`、Store `/api/auth/*` 同源代理、桌面 web-relay 三处协调切换，按下面 Phase 分批做绿。API 侧保留了 Supabase **回退路径**（dual-path，见 Phase 2），作为切换期的安全网，待 Phase 3 摘除。

## 4. 分阶段执行（每阶段 e2e 保持绿 + 可回滚）

> 原则：**test 先一直挂在现有 Supabase 上**，逐块把 Neon/Better Auth 等价物做绿再切；每阶段一个 PR，回滚 = revert 该 PR。实际按此执行，合并为 **PR #7–#12**。

### Phase 0 — Neon + Drizzle schema（零行为变更）✅ 已完成
- 建 Neon **test 项目 `agent-store-test`**（project id `late-sea-44274892`，org `alex`；开 Neon Auth）；prod 项目 **`agent-store`**（无后缀）押后到 Phase 3 再建。
- 用 **Drizzle** 重写 schema（`apps/api/src/db/schema.ts`，对齐 5 个 migration 的表/列/类型/默认值/check/外键/唯一约束/索引），`drizzle-kit` 生成迁移 `apps/api/drizzle/0000_init.sql` 打到 Neon。
- 刻意**不复制**：RLS 策略与 GRANT（授权上移到 API 层）；`update_updated_at()` 触发器改用原生 SQL 追加到迁移末尾（drizzle-kit 不建模触发器）。
- **实际验收**：Neon test 库 schema 与 Supabase 一致，纯并行准备、未接线到运行代码。

### Phase 1 — 数据层切 Drizzle（先不动 Auth）✅ 已完成
- API 的 `queries.ts` / `subscription-queries.ts` / `publisher-items.ts` 从 supabase-js 换成 **Drizzle 打 Neon**（`getDb(c.env)` → `drizzle(neon(DATABASE_URL))`，Neon HTTP driver，Workers 友好、无常连接、一次查询一趟往返）；**认证暂仍走 Supabase**。
- 授权逻辑从 RLS 上移到 API handler。
- **实际验收**：目录浏览/安装、订阅落库、评价读写、版本历史全部经 Neon；e2e 绿。回滚点 = 切回 supabase-js。

### Phase 2 — Auth 换 Neon Auth（大头）✅ 已完成
- **Neon Auth = 托管的 Better Auth**：session JWT 用 **EdDSA/Ed25519** 签，经 **JWKS** 公钥校验；payload 携带 `sub`（user id）+ `email`。
- **社交登录用自建 OAuth app**：GitHub + Google 都在 Neon Auth 侧配成**本产品自己的 OAuth app**——因为 Neon 的**共享 OAuth 只支持 Google、不支持 GitHub**，而 agent-store 主登录是 GitHub，必须自建。
- **API 校验**：`apps/api/src/neon-auth.ts` 用 **`jose`**（`createRemoteJWKSet` + `jwtVerify`）校验 JWT。GitHub **username 不是 JWT claim**（Better Auth 只存 provider 的**数字 account id**），所以 username→publisher 映射走：`neon_auth.account.accountId`（GitHub 数字 id）→ GitHub `GET /user/{id}` → `login` → `publisher.slug`（`neonAuthUsername()` + `githubLoginById()`，按 user 缓存）。
- **Store（同源代理）**：`app/api/auth/[...path]/route.ts` 用 `createNeonAuth(cfg).handler()` 把所有 `/api/auth/*` 调用**同源代理**到远端 Neon Auth，session cookie 落在本域。OAuth 回调返回 `?neon_auth_session_verifier=`，由客户端消费建立同源 session；调独立 API 用的 JWT 从 `/api/auth/token` 取。`auth` **懒实例化**（`lib/auth/server.ts`），因为 `createNeonAuth` 缺 cookie secret 会抛，而那是 runtime-only 变量——延迟到首个请求才创建，Cloudflare 构建期就不需要它（见 commit `31fe522`）。
- **桌面端 web-relay**：见 §3 硬骨头 1。Neon Auth 拒自定义 scheme 回调、也拒裸 Bearer session token，故桌面开系统浏览器进 `/auth/desktop` → 换 JWT → 深链回 app。
- **trusted_origins**：通过 **SQL 直接写** `neon_auth.project_config.trusted_origins`（**http origins 会被认可，自定义 scheme 不会**）；管理 API 的 `PATCH .../auth/config` 只接受 `name` 字段，配不了 origins。
- **切换期安全网**：API `getAuthUser` 保留 **dual-path**——`NEON_AUTH_JWKS_URL` 配了就先试 Neon Auth，否则/失败再回退 Supabase。worker 上一旦设了该 URL 即以 Neon Auth 为准；Supabase 路径待 Phase 3 摘除。
- **实际验收**：三端 GitHub/Google 登录、entitlement 读取、发评价全通；e2e 绿。

### Phase 3 — 切换与清理 🔜 剩余待办
- **实切已做**（test）：worker secrets 经 `wrangler secret put` 下发并部署，**端到端已验证**：
  - API worker `as-api-test`：`DATABASE_URL` + `NEON_AUTH_JWKS_URL`。
  - Store worker `agent-store-web`：`NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET`。
- **仍待办**：
  - 下线 supabase-js 依赖（`@supabase/*` 仍在 `apps/{api,store,cli-gui}/package.json`）与残留 `src/supabase.ts`、`getAuthUser` 的 Supabase 回退分支。
  - 清掉 env 模板里的 `SUPABASE_*`（`apps/api/.dev.vars.example`、`apps/store/.env.local.example` 仍留着）。
  - 建 **prod `agent-store` Neon 项目**（付费档，独立用户表），把 store/API 的 prod secret 指过去。
  - Supabase 项目**保留一段时间做备份**，稳定后再停用。
- **验收目标**：全链路无 Supabase 依赖；e2e 绿；Waffo 付费/试用闭环回归通过（见现有 checkout/webhook）。

## 5. 数据迁移（实际做法）

- 目录数据（items/publishers/…）：从 Supabase `agent-store-test` 导出 → 导入 Neon（纯表数据，直接搬）。
- 用户：Supabase `auth.users` → Neon Auth（Better Auth）用户表。**因 prod 未上线、仅 test 用户**，直接重建、不做复杂映射；用户重新用 GitHub/Google 登录即在 `neon_auth.*` 里新建。
- 订阅（subscriptions）：test 里那条测试订阅重建即可；prod 上线后由 Waffo webhook 自然落库。

## 6. 配置/密钥变更

**已新增（test 实切用）**：
- `DATABASE_URL`（Neon 连接串）。
- API worker `as-api-test`：`NEON_AUTH_JWKS_URL`（校验 JWT 的 JWKS 端点）。
- Store worker `agent-store-web`：`NEON_AUTH_BASE_URL`（Neon Auth 端点）+ `NEON_AUTH_COOKIE_SECRET`（签同源 session cookie）。
- GitHub / Google OAuth app 凭据（Neon Auth 侧配的自建 app）。
- env 模板：`apps/api/.dev.vars.example`、`apps/store/.env.local.example` 已补 `DATABASE_URL` / `NEON_AUTH_*`。

**待移除（Phase 3）**：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_*`（env 模板里目前仍并存）。

## 7. 风险回顾（实际怎么走的）

- **桌面深链回流**（原最大不确定项）→ 结论：Neon Auth 不支持自定义 scheme 回调、也不吃裸 Bearer session token，**放弃直接深链**，改 **web-relay**（store 页换 JWT 再深链回 app）跑通。
- **e2e 依赖**：e2e 用到 Supabase 的地方已同步切到 Neon/Better Auth，门禁保持绿。
- **Waffo 不动**：支付这条与 Supabase 无关，全程未碰；仅 webhook 落库的目标从 Supabase 表变成 Neon 表（Phase 1 已覆盖）。
- **RLS 心智转变**：授权从"数据库兜底"变"代码兜底"，已补 API 层授权测试；schema 刻意不复制 RLS/GRANT。
- **切换期双认证**：dual-path（Neon 优先、Supabase 回退）保留至 Phase 3，作为回滚安全网——代价是 Supabase 代码/依赖尚未清干净。

## 8. 顺序小结

Phase 0（准备，零风险）✅ → Phase 1（数据层，可回滚）✅ → Phase 2（Auth，含桌面 web-relay）✅ → Phase 3（下线 Supabase + 建 prod `agent-store` Neon 项目）🔜。全程 test 不断线、每阶段 e2e 卡绿、每阶段独立 PR（合并为 #7–#12）。test 已实切到 Neon 并端到端验证，剩 Phase 3 的清理与 prod 建库。
