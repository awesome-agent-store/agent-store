# 开发与部署 Runbook（本地 / 线上测试 / 线上生产）

三套环境，操作与配置不同。详见 skill `indie-deploy` 与
`docs/superpowers/specs/2026-07-05-deployment-dual-region.md`。

---

## 触发 → 环境（CI/CD）

由 GitHub Actions 完成（`deploy-api` / `deploy-store`）：

| 触发 | wrangler env | API worker | Neon 库 | Store worker | 域名 |
|---|---|---|---|---|---|
| push/merge 到 `main` | `test` | `as-api-test` | `agent-store-test`（late-sea） | `agent-store-web-test` | `test.agent-store.panghuli.tech` |
| push 版本 tag `v*` | `production` | `as-api-prod` | `agent-store`（jolly-breeze） | `agent-store-web` | `agent-store.panghuli.tech` |

- **开发**：基于 `main` 建功能分支 → 开 PR（e2e 门控）→ 合入 `main`。合入即部署**测试**环境
  （`e2e` 通过后触发 `deploy-*`，仅当 `apps/api` / `apps/store` / `packages` / lockfile 变更时才部署）。
- **发布生产**：打并推送 `v*` tag（如 `git tag v0.1.0 && git push origin v0.1.0`）。tag 总是部署生产，
  同一个 tag 也驱动桌面端发布（`release.yml`）—— 一次 tag = 一次完整发布。
- Store 的 `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SITE_URL` 在 CI 构建时按目标 env 注入（客户端 bundle 烘焙）；
  服务端 `API_URL` 走 `apps/store/wrangler.jsonc` 的 `env.<test|production>.vars`。
- 每个 env 的 Worker secret（`DATABASE_URL` / `NEON_AUTH_JWKS_URL` / `WAFFO_*`）一次性用
  `wrangler secret put <NAME> --env <test|production>` 注入，不入库、不由 CI 管理。

---

## A. 本地开发环境（已就绪，一条命令起）

前提：Docker 运行中；已有 `apps/store/.env.local`（本地 Supabase 的 URL + anon key，`supabase status` 可查）。

| 命令 | 起什么 | 端口 |
|---|---|---|
| `make dev-gui` | 本地 Supabase + 目录 API(apps/api) + 桌面客户端(Tauri)，客户端经 `AS_STORE_URL` 指向本地 API | DB 54321 / API 3001 / app 窗口 |
| `make dev-api` | 本地 Supabase + 目录 API | API 3001 |
| `make dev` | 本地 Supabase + Web 商店(next dev) | web 3000 |
| `make seed` | 重置本地 DB 并灌 seed（`supabase/seed.sql`，含 local/yls/skyapi） | — |

- 数据可随意重置：`make seed`。
- 本地 API 冒烟：`curl "http://127.0.0.1:3001/api/items?category=provider"`。
- 本地绝不连云端；密钥只在 `.env.local`（已 gitignore）。

---

## B. 线上测试环境（核心已上线 ✅，仅剩 web 前端）

通过 headless `claude -p` 子进程驱动 MCP 自动部署完成（绕过"会话中途 MCP 工具不加载"的限制）。

### 已上线 ✅
- **Supabase 测试项目** `agent-store-test`（ref `faiygihglitiuqywajyh`，Singapore 区），已推 migration + seed（含 local/yls/skyapi）。
- **目录 API** 在 Cloudflare Workers：**https://as-api-test.phenix3443.workers.dev**
  - 冒烟：`curl "https://as-api-test.phenix3443.workers.dev/api/items?category=provider"` → 返回 6 个 provider。
  - Supabase URL/anon key 已作为 Worker secret 注入（test 环境）。
- **CLI 指向线上 API** 已验证可用：
  ```bash
  AS_STORE_URL=https://as-api-test.phenix3443.workers.dev \
    bun run apps/cli/src/index.ts __rpc search '[""]'
  ```
- 凭据（URL/anon/db 密码/worker URL）存于本会话 scratchpad 的 `test-env-creds.env`，**未入库**。

> 至此 CLI / 桌面客户端已可对着线上测试 API 工作 —— 测试环境核心可用。

### 仅剩：Web 前端上 Vercel（需你交互授权一次）
Vercel 的 MCP 无"源码部署/建 git 项目"工具，CLI token 又已过期被清。需你二选一:
```bash
! bunx vercel login          # 交互 OAuth
# 或在 Vercel 控制台 Account Settings → Tokens 生成后：
! export VERCEL_TOKEN=xxxx
```
授权后我用 headless 子进程完成：建/连项目（Root Directory = apps/store）、设环境变量（测试 Supabase URL/anon key + 上面的 Worker URL）、部署 preview、验证 200。

---

## 支付集成（Waffo Pancake, MoR）

订阅收款走 Waffo Pancake（Merchant of Record）。服务端已接入（`apps/api`）：`POST /api/billing/checkout` 建 checkout、`POST /api/webhooks/waffo` 收 webhook 落 `subscriptions` 表、`GET /api/entitlements?email=` 解析 plan。集成指南见 `.claude/skills/waffo-pancake/SKILL.md`。

### 需要的 secret（Dashboard → 集成 页获取，KYB 通过后开生产）
| 变量 | 用途 |
|---|---|
| `WAFFO_MERCHANT_ID` | 商户 ID |
| `WAFFO_PRIVATE_KEY` 或 `WAFFO_PRIVATE_KEY_BASE64` | RSA 私钥（CI/CD 建议用 base64 形式） |
| `WAFFO_PRODUCT_ID_PRO_MONTHLY` / `WAFFO_PRODUCT_ID_PRO_YEARLY` | Pro 月/年订阅产品 ID |
| `WAFFO_CHECKOUT_SUCCESS_URL` | 付款后跳转（可选，缺省用 store 设置） |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook/entitlements 写读 `subscriptions`（绕过 RLS） |

注入到 Cloudflare Workers（test 环境示例）：
```bash
wrangler secret put WAFFO_MERCHANT_ID --env test
wrangler secret put WAFFO_PRIVATE_KEY_BASE64 --env test   # cat private.pem | base64 | tr -d '\n'
wrangler secret put WAFFO_PRODUCT_ID_PRO_MONTHLY --env test
wrangler secret put WAFFO_PRODUCT_ID_PRO_YEARLY --env test
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env test
```
本地开发放 `.env.local`（已 gitignore）。

### Dashboard 配置 webhook
把 webhook（channel `http`）指到部署地址：
- 测试环境：`https://as-api-test.phenix3443.workers.dev/api/webhooks/waffo`
- 订阅事件：`subscription.activated` / `subscription.payment_succeeded` / `subscription.canceling` / `subscription.canceled` / `subscription.past_due`
- 本地联调用 `ngrok http 3001`（localtunnel 会剥掉 `X-Waffo-Signature`，别用）。

### 数据库
`supabase/migrations/002_subscriptions.sql`（`subscriptions` + `processed_webhooks`，均开 RLS、无公开策略）。上线前 `supabase db push` / 迁移到对应项目。

### 待办（客户端最后一公里）
`subscriptions.buyer_identity` 预留了给 Phase 2 账号（Supabase Auth）绑定用。当前桌面端「激活 Pro」的绑定方式（邮箱 vs 登录账号）取决于 Phase 2 决策，尚未接客户端 UI。

---

## 桌面安装包分发（Cloudflare R2）

落地页的「下载 for Mac / Windows」按钮读环境变量，**不走 GitHub Release**（仓库转私有后 Release 无法对公众提供下载）：
- `NEXT_PUBLIC_DOWNLOAD_MAC_URL` / `NEXT_PUBLIC_DOWNLOAD_WIN_URL`（未设置时按钮指向 `#`）

流程：CI（`tauri-action`）构建安装包 → 上传到 **Cloudflare R2**（公开桶或自定义域，零出口流量）→ 把上面两个 env 设到 Vercel（Production/Preview scope）指向 R2 的安装包 URL。Tauri 自动更新的 manifest + 二进制也放 R2。

## C. 线上生产环境（核心已上线 ✅）

推 `v*` release tag 即部署生产（见顶部「触发 → 环境」表）。已就绪：

- **API** `as-api-prod`（Cloudflare Workers）：https://as-api-prod.phenix3443.workers.dev
  - 数据层 Neon `agent-store`（jolly-breeze，us-east-1），已 `drizzle-kit migrate` 建表。
  - Neon Auth 已 provision（JWKS 已注入 Worker secret），trusted origin 含
    `https://agent-store.panghuli.tech`。
  - 目录数据：从 `supabase/seed.sql` 的真实爬取目录导入，去掉纯本地测试的 `local` provider。
  - **GitHub OAuth ✅**：standard App `Ov23libYqp7LUPlxHdMN`，回调 `…/neondb/auth/callback/github`
    （creds 在 `.secrets/github/prod-oauth.yaml`）。
- **Store** `agent-store-web`（OpenNext on Workers）：https://agent-store.panghuli.tech → prod API。
- **Waffo（MoR 支付）**：当前复用 testnet 商户/产品密钥作为过渡；真实生产收款需 KYB 通过后
  换正式密钥（`wrangler secret put WAFFO_* --env production`）。

### 尚待完善
- **正式 Google OAuth**：prod 目前 GitHub（standard）+ Google（shared）；品牌化 Google 登录需
  新建 Google OAuth App 后经 REST `/auth/oauth_providers` 接入（同 GitHub 流程）。
- **Waffo 生产密钥**：KYB 通过后替换 testnet 过渡密钥。
- 桌面端分发（Releases + R2 镜像 + Tauri updater + 签名）。
