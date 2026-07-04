# 用量与成本统计 Design

**Goal:** 让 relay 转发的每一次请求都被记录下来（token 用量、按供应商定价算出的成本、成功率、延迟），并通过 CLI 和 GUI 展示按日期/供应商/模型的汇总数据。

## 背景

参考 code-switch-R（`services/logservice.go`）和 cc-switch（`src-tauri/src/proxy/usage/`）的用量统计实现：两者都把每次请求的明细落库，再按日聚合，前端展示成功率/请求数/Tokens/花费。本项目当前的 relay（`apps/client-core/src/relay/server.ts`）只做转发，不记录任何请求信息。

关键差异点（已与用户确认）：本项目里被转发的目标大量是第三方 API 中转（如 yls、skyapi），**不是官方 Anthropic/OpenAI 直连**，因此不能像常见做法那样内置一份官方定价表当默认值——第三方中转的实际计费与官方定价无关，必须按供应商各自的定价配置来算成本。

## 范围决策（已与用户确认）

- 存储用 `bun:sqlite`（Bun 内置，无需新依赖），不引入 SQLite 之外的数据库。
- 一次性支持流式（SSE）与非流式响应的用量提取，不做"先只支持非流式"的阶段性缩水——Claude Code / Codex 的真实请求大多数是流式的，只支持非流式会导致统计数据大量缺失。
- 定价完全由用户在供应商配置里手填，**不内置任何官方或第三方的默认定价数字**。
- 供应商配置新增必填的 `pricingUrl`（第三方中转供应商，即 `publisher.tier !== 'official'`）——指向该中转自己的定价页面，作为用户核对价格的依据。
- 提供"解析定价"辅助功能：抓取 `pricingUrl` 内容，用 LLM 结构化提取定价表，回填到编辑表单供用户确认/修改后再保存——不自动写入未经确认的数字。**本次先用 mock 数据打通整条 UI 链路**（抓取 → 提取 → 回填表单 → 用户确认 → 保存），真正接入 LLM 调用是后续任务，不在本次范围内。
- 明细日志（`request_logs`）保留 30 天，按日汇总（`daily_rollups`）永久保留，不清理。
- 展示入口：CLI（`aas usage` 命令）+ GUI（新增用量面板）都做。

## 架构

### 数据模型（`apps/client-core/src/usage/db.ts`）

数据库文件路径：`{aasHome}/usage.db`。

```sql
CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  provider_slug TEXT NOT NULL,
  target TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  is_streaming INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_rollups (
  date TEXT NOT NULL,
  provider_slug TEXT NOT NULL,
  target TEXT NOT NULL,
  model TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  unpriced_request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, provider_slug, target, model)
);
```

`cost_usd` 在 `request_logs` 里可以是 `NULL`（该模型未配置定价，不是免费）；`daily_rollups.cost_usd` 只累加有定价的请求的成本，未定价的请求数单独计入 `unpriced_request_count`，避免"未知成本"被静默算成 0 误导汇总数字。

### 供应商定价配置（`apps/client-core/src/config/provider.ts` 扩展）

```ts
export interface ModelPricing {
  input: number       // 每百万 input token 美元
  output: number       // 每百万 output token 美元
  cacheRead?: number   // 每百万 cache-read token 美元
  cacheWrite?: number  // 每百万 cache-write token 美元
}

export interface ProviderConnection {
  // ...现有字段（apiKey/baseUrl/authType/modelMapping）
  pricingUrl?: string
  pricing?: Record<string, ModelPricing>  // key 为模型名，精确匹配
}
```

存放位置与 `modelMapping` 一致（同一个 `config.json`），随 `readProviderConnection`/`setConfig` 现有读写路径一起持久化，不新增单独的配置文件。

### 用量解析（`apps/client-core/src/usage/usage-parser.ts`）

两个格式分别处理：

- **Claude Messages API**（target `claude`）：非流式响应体的 `usage` 字段（`input_tokens`/`output_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens`）；流式响应需要解析 SSE 事件流，从 `message_start`（初始 `usage.input_tokens`）和 `message_delta`（结束时的 `usage.output_tokens` 等增量）里累加出最终用量。
- **OpenAI Responses API**（target `codex`）：非流式响应体的 `usage` 字段（`input_tokens`/`output_tokens`/`input_tokens_details.cached_tokens`）；流式响应从 `response.completed` 事件的 `response.usage` 字段读取（该事件在流末尾出现一次，包含完整用量，不需要像 Claude 那样累加多个事件）。

两种解析器都返回统一的内部形状 `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`，供 `logger.ts` 统一处理，屏蔽上游协议差异。

### relay 集成（`apps/client-core/src/relay/forward.ts` 改造）

`forwardRequest` 返回上游 `Response` 后，在 `server.ts` 里改用 `response.body!.tee()` 拆成两路：

```ts
const [clientStream, usageStream] = upstreamResponse.body!.tee()
const clientResponse = new Response(clientStream, {
  status: upstreamResponse.status,
  headers: upstreamResponse.headers,
})
// 不 await——不阻塞返回给客户端的响应
const contentType = upstreamResponse.headers.get('content-type') ?? ''
recordUsageAsync({
  aasHome, providerSlug: provider.slug, target, model: mappedModel,
  isStreaming: contentType.includes('text/event-stream'),
  bodyStream: usageStream, statusCode: upstreamResponse.status,
  startedAt, contentType,
})
return clientResponse
```

`isStreaming` 完全由响应的 `content-type` 判定（`text/event-stream` 即流式），不看请求体里的 `stream` 参数——响应的实际形态才是解析器要处理的对象，两者理论上应该一致，但以响应为准更可靠。

`recordUsageAsync`（`apps/client-core/src/usage/logger.ts`）读取 `usageStream`、按 `isStreaming` 选择对应的 parser、算出 tokens，查该 provider 的 `pricing` 配置算成本（模型未命中 `pricing` 时 `cost_usd = null`），写 `request_logs` 一行，并原子 upsert 当天的 `daily_rollups` 一行（`INSERT ... ON CONFLICT DO UPDATE`，用当前值+增量）。这个函数内部任何解析失败都要吞掉（`try/catch` 只 `console.error`，不能因为统计失败影响转发本身——转发的可靠性优先于统计的完整性）。

### 数据保留（`apps/client-core/src/usage/logger.ts` 里的清理逻辑）

每次写入 `request_logs` 后，顺带执行 `DELETE FROM request_logs WHERE created_at < date('now', '-30 days')`（SQLite 的 `DELETE` 在小数据量下足够快，不需要单独的定时任务/cron）。`daily_rollups` 永不清理。

### CLI（`apps/cli/src/commands/usage.ts`，新命令）

```
aas usage [--days N] [--provider <slug>] [--for <claude|codex>]
```

默认 `--days 30`，从 `daily_rollups` 按条件过滤+汇总，输出表格：日期/供应商/模型/请求数/成功率/Tokens/花费（未定价的行花费列显示"—"而不是 `$0.00`）。

### GUI（`apps/cli-gui`）

- `AppState.navView` 新增 `'usage'`；`IconRail` 新增用量图标（bar-chart 一类），点击设为该值。
- 新组件 `UsageDashboard.tsx`：`navView === 'usage'` 时替代 `ResourceList` 渲染，顶部卡片（近 30 天总花费/总请求数/成功率），下方按日期/供应商/模型的汇总表格，复用 `IconRail` 的分类筛选（按 provider 过滤）。
- `ProviderEditModal.tsx` 新增"定价"分区：
  - `pricingUrl` 输入框；当 `publisher.tier !== 'official'` 时标红星必填，未填不允许保存（表单层校验，不阻塞已有的 `setConfig` RPC 契约）。
  - "解析定价"按钮：调用新 RPC `parsePricingFromUrl(pricingUrl)` → **本次返回 mock 数据**（固定返回一组标注"示例数据，请核对后保存"的占位定价行）→ 回填到下方可编辑的定价表单（复用 `modelMapping` 现有的"增加一行/删除一行"UI 模式）→ 用户确认/修改后随 `setConfig` 一并保存。

## 测试与自测计划

- 单元测试：`usage-parser.ts`（Claude 流式/非流式、OpenAI 流式/非流式四种组合的用量提取）、`pricing.ts`（成本计算，含未命中定价返回 `null` 的分支）、`db.ts` 的 rollup upsert 逻辑（累加正确性）、30 天清理的边界条件。
- **必做的浏览器/真实环境自测**（按 `AGENTS.md` 的 UI sign-off 规则）：`make dev-gui` 实际跑一遍——用真实（或 mock 上游）relay 请求验证 usage.db 确实写入了明细和汇总行；GUI 用量面板与 CLI `aas usage` 输出的数字一致；`ProviderEditModal` 的定价表单能保存并在下次打开时正确回显。

## 不做的事（YAGNI）

- 不实现真正的 LLM 定价页面提取调用——`parsePricingFromUrl` 本次返回 mock 数据，真实提取是独立的后续任务。
- 不内置任何官方或第三方的默认定价表。
- 不做用量数据的导出（CSV/Excel）、图表可视化（折线图等）——GUI 先做表格，图表是可选的后续增强。
- 不做多币种支持，一律美元。
- 不做明细日志的按需查询/搜索（GUI 只展示按日汇总，明细表只用于内部聚合和排障）。
