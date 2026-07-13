# 标准后端栈（所有独立产品复用）

> 定稿 2026-07-10。这是每个新产品的默认后端选型与约定。目标：**很多独立小产品、test 免费、prod 付费换稳定、环境之间零差异债**。
> agent-store 是第一个采用这套栈的产品，作为新产品的 starter 模板。

## 1. 选型总览

| 层 | 选型 | 为什么 |
|---|---|---|
| 计算 | **Cloudflare Workers** + **Hono** | 已在用；一个账号无限 Worker，按量、边际成本≈0 |
| 数据库 | **Neon**（serverless Postgres） | 免费档 ~100 项目 + scale-to-zero → test 免费；prod 上付费档换常驻+备份。**test/prod 同引擎** |
| 认证 | **Neon Auth**（Neon 托管的 Better Auth） | 一键开、$0 到 60K MAU、用户**直接同步进你的 Neon 库**、每项目各自隔离；底层是 Better Auth，脱离 Neon 可自托管同一个库 |
| 数据访问 | **Drizzle ORM** | 类型安全 + 迁移工具（drizzle-kit）；不锁厂商；边缘友好 |
| 对象存储 | **Cloudflare R2**（按需） | 同账号、零 egress |
| 支付 | **Waffo Pancake**（MoR） | 已接；见 agent-store |

**明确不用**：D1/Turso（SQLite：无 RLS、单写、要把 Postgres 重写成 SQLite = 正是要避免的差异债，AI 向量也弱）。

## 2. 环境模型

三套环境，规则：**dev 与 test 共用外部服务与数据；prod 与 test 完全隔离；三者同技术栈只换实例。**

| 维度 | dev（本地） | test（线上） | prod（线上） |
|---|---|---|---|
| Worker | `wrangler dev` @127.0.0.1 | `<app>-test` | `<app>-prod` |
| Neon | 指向 test 的免费库（共用） | 免费项目 | **独立付费项目** |
| Better Auth | 指向 test 库 | test 库 | prod 库（独立用户表） |
| 前端 API 地址 | `http://127.0.0.1:8787` | `<app>-test.workers.dev` | prod 域名 |
| 数据 | ← 与 test 同一份 → | 共享 | 隔离 |

要点：**同一个 Postgres 引擎贯穿三套环境**，schema/查询/迁移完全一致，杜绝"test 一套 prod 另一套"的行为分叉。

## 3. 认证：Neon Auth（托管 Better Auth）+ Model 2

- **首选 Neon Auth**：建 Neon 项目时一键开启。它**底层就是 Better Auth**，但由 Neon 托管，用户/session **直接同步进该产品的 Neon 库**（可与业务表 JOIN）。免费档含到 60K MAU、付费档含到 1M MAU → 现阶段实质 $0。
- **每产品一套（Model 2）**：每个产品各自的 Neon 项目开各自的 Neon Auth → 用户/数据天然隔离，产品间无耦合、无单点故障。
- **社交登录**：GitHub/Google 等在 Neon Auth 侧配置（每产品各自的 OAuth app）。
- **消费方**：
  - Web（Next.js）：用 Neon Auth 的 SDK/组件取 session。
  - 桌面/CLI（Tauri）：系统浏览器走 OAuth → 深链 `<app>://auth-callback` 带回 session；本地存 token，之后作为 Bearer 调 API。（此流程需实测。）
  - API（Worker）：校验 Neon Auth 的 session 替代原来的第三方 `getUser`。
- **可移植退路**：Neon Auth 把 auth 绑在 Neon 上；因我们已把 Neon 定为标准 DB，这个耦合可接受。万一某产品将来不放 Neon，因底层是 Better Auth，可在别处**自托管同一个 Better Auth**，配置/心智通用。
- **演进到 SSO**：需要跨产品单点登录时，再把某产品的 Better Auth 升级成中央 **OIDC Provider**，其它产品接入。Model 2 → 中央 SSO 平滑，反向很痛，故默认从 Model 2 起步。

## 4. 数据访问与授权

- **Drizzle** 定义 schema（TS）+ `drizzle-kit` 生成/执行迁移，替代手写 SQL 迁移。
- **授权放在 API 层，不依赖数据库 RLS**。理由：新架构里 **API（Worker）是数据库的唯一客户端**（用 service 级连接），浏览器/桌面端只经 API 访问数据，不直连库。因此把"谁能读写什么"写进 Worker 代码，比依赖 Postgres RLS 更直观、可测试（RLS 的 `auth.uid()` 依赖由数据库注入的身份，我们这套架构里不成立）。
- 需要向量/AI：Neon 有 `pgvector`，直接用。

## 5. 配置与密钥约定

- 本地：`apps/api/.dev.vars`（gitignore），`.dev.vars.example` 入库做模板，值指向 **test 的共享服务**。
- 线上：`wrangler secret put <KEY> --env test|production`。禁止把密钥写进 `wrangler.toml`。
- 标准 env 键：
  - `DATABASE_URL`（Neon 连接串，含 pooler）
  - Neon Auth 的项目级 keys（建项目时 Neon 生成：project id + publishable client key + secret server key）
  - GitHub OAuth app 凭据（在 Neon Auth 侧配社交登录，每产品各自）
  - 产品相关（如 Waffo 的 `WAFFO_*`）
- 前端构建期：`NEXT_PUBLIC_API_URL` 按环境注入（dev=`http://127.0.0.1:8787`，test/prod=对应 Worker）。

## 6. CI/CD 与分支纪律

- **一律走 PR**：`分支 → PR → e2e 绿 → merge`。分支保护 `strict + required: e2e`，**不 admin bypass**（见记忆 `no-bypass-pr-flow`）。
- e2e 是真跑 agent + 真装包的端到端测试；部署 gated 在 e2e 成功之上。
- Worker 部署：`wrangler deploy --env test|production`。

## 7. 起一个新产品的清单

1. `clone` agent-store starter（迁移完成后即成模板）。
2. Neon：建 **test 免费项目** + **prod 付费项目**；把连接串设成 `<app>-test` / `<app>-prod` 的 secret。
3. Neon Auth：建 Neon 项目时开启 Neon Auth，配该产品的 GitHub OAuth app，拿到 Neon Auth 项目级 keys 设成 secret。
4. Drizzle：改 schema，`drizzle-kit push` 到 test/prod。
5. 前端 `NEXT_PUBLIC_API_URL` 指向对应 Worker。
6. 建分支开 PR，e2e 绿后 merge、部署。

## 8. 成本速览

- **test/dev**：Neon 免费（含 Neon Auth 到 60K MAU）+ Workers 免费额度 = **$0**。
- **prod（每产品）**：Neon 付费档（用量计费，无月费地板）+ Workers 按量 + R2 按需。Neon Auth 含到 1M MAU，无额外月费。
- 产品越多，靠"每产品一个 Neon 项目 + scale-to-zero"把闲置成本压到接近 0；真到规模再谈单产品的付费档。
