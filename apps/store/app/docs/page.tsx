'use client'

interface DocSection {
  num: string
  title: string
  body: string
  bullets?: string[]
  code?: string
}

const DOCS: DocSection[] = [
  {
    num: '01',
    title: '什么是 Agent Store',
    body: 'Agent Store 是面向 Claude Code / Codex 等 AI 编码工具的「应用商店 + 本地管理客户端」。它由两个界面组成：浏览器里的 Web 商店，用于发现、搜索和发布资源；本机的桌面客户端，用于统一管理已安装的资源、查看消耗，并运行内置的本地代理。你可以在这里一键安装三类资源：',
    bullets: [
      '技能(Skill)——为 Claude Code / Codex 补充的工作流与专长',
      'MCP 服务器——通过 Model Context Protocol 接入的外部工具与数据源',
      '供应商(Provider)——模型接入配置，包括你自己的 API Key 与上游地址',
    ],
  },
  {
    num: '02',
    title: '安装桌面客户端',
    body: '从落地页顶部的下载按钮获取 macOS 或 Windows 桌面客户端。桌面端负责管理本机已安装的资源、维护供应商配置、运行本地代理，并展示消耗仪表盘。安装后无需额外配置即可开始浏览商店；登录后可跨设备同步已安装的技能 / MCP / 供应商。',
  },
  {
    num: '03',
    title: '在市场中浏览与安装',
    body: '商店页顶部是筛选行，下方是三列卡片网格。你可以按分类 chip 切换「供应商 / 技能 / MCP / 收藏」，用排序在「最流行 / 评分最高」之间切换，打开「仅验证」只看官方或已核验的资源，或直接搜索。',
    bullets: [
      '每张卡片显示类型图标、包名、作者、验证徽章、简介，以及下载量、评分、版本等统计',
      '点击卡片从右侧滑出详情抽屉：README 概述、评价、版本三个 Tab，以及安装命令与统计四宫格',
      '点「安装到客户端」把资源加入本机，或复制安装命令在终端执行；已验证资源带 ✓ 徽章',
    ],
  },
  {
    num: '04',
    title: '三类资源安装到哪里',
    body: '安装会把资源下载到本机的 ~/.agents 目录（技能、MCP、供应商各有独立子目录），随后按类型接入到你选择的 CLI 工具。启用某个资源时需指定它对哪个工具生效（Claude Code 或 Codex）。',
    bullets: [
      '技能：作为一个 Markdown 文件写入对应工具的 skills 目录（如 ~/.claude/skills/<名称>.md）',
      'MCP：把服务器条目写入工具配置——Claude Code 写入 ~/.claude/settings.json 的 mcpServers，Codex 写入 ~/.codex/config.toml 的 mcp_servers',
      '供应商：登记为一份可编辑的接入配置（保存你的 API Key、上游地址、模型映射等），启用后通过本地代理生效',
    ],
  },
  {
    num: '05',
    title: 'local 本地代理',
    body: 'local 是内置的本地代理，也是使用供应商的核心。启用后，它把 Claude Code / Codex 的 API 地址指向本机回环端口（默认 http://127.0.0.1:18780，仅监听 127.0.0.1），请求先到达本地代理，再由代理按你的供应商配置转发到真正的上游。这样带来几个好处：',
    bullets: [
      '无需把真实 API Key 交给 CLI——代理向下游 CLI 注入的是占位令牌，真实凭证只保存在本地供应商配置里，由代理在转发时附加',
      '模型映射与白名单：可以把请求里的模型名重写成上游支持的型号，或限制某个供应商只处理白名单内的模型',
      '用量计量：每次请求的输入/输出/缓存 Token、费用、耗时、状态码都会被记录，用于消耗仪表盘',
      '支持多份监听配置，各自使用独立端口（默认从 18780 起，每份递增 100）',
    ],
    code: '# ANTHROPIC_BASE_URL=http://127.0.0.1:18780   (Claude Code)\n# model_providers."aas-relay".base_url = "http://127.0.0.1:18780"   (Codex)',
  },
  {
    num: '06',
    title: 'Level 优先级与失败降级',
    body: '每个供应商配置可以设置一个 Level（整数，数字越小优先级越高，默认 1）。同一次请求会先按 Level 升序挑选候选供应商，从最优先的开始尝试；一旦某个候选失败，自动切换到下一个，从而在多家上游之间实现无感容灾。触发降级、切到下一个候选的情况有：',
    bullets: [
      '网络层错误（如连接被拒绝、DNS 失败）',
      '上游返回 5xx 服务端错误',
      '请求的模型不在该供应商的白名单内',
    ],
  },
  {
    num: '07',
    title: 'CLI 使用',
    body: '除了桌面客户端，命令行也能完成安装与管理。用 add 安装资源，用 enable 让它对指定工具生效，再用 sync 把已启用的资源写入工具配置。常用命令：',
    code:
      '$ agent-store add <slug>            # 安装资源\n' +
      '$ agent-store list                 # 查看已安装\n' +
      '$ agent-store search <query>       # 搜索市场\n' +
      '$ agent-store info <slug>          # 查看资源详情\n' +
      '$ agent-store enable <slug> --for claude   # 对 Claude Code 启用\n' +
      '$ agent-store disable <slug> --for codex   # 对 Codex 停用\n' +
      '$ agent-store sync                 # 同步已启用资源到工具配置\n' +
      '$ agent-store relay start|stop|status      # 管理本地代理\n' +
      '$ agent-store usage --days 7       # 查看用量与费用\n' +
      '$ agent-store update [slug]        # 更新已安装资源',
  },
  {
    num: '08',
    title: '消耗仪表盘',
    body: '桌面客户端的概览页汇总本地代理记录的用量：消耗趋势折线图（今日 / 近 7 天 / 近 30 天）、总费用、总 Token 数、总请求数与模型分布，以及本地代理的监听地址、今日请求、成功率和运行开关。最近请求日志按应用、模型 → 供应商、耗时和状态码逐条展示。命令行下用 agent-store usage 可查看同样的汇总，并支持按天数、供应商或工具过滤导出。',
  },
  {
    num: '09',
    title: '发布你的资源',
    body: '登录后点顶部「发布」，选择类型（供应商 / 技能 / MCP）并填写元信息即可提交。表单字段随类型变化。提交后资源以「审核中」状态出现在你的个人主页，审核通过后对所有用户可见，可被搜索和安装。',
  },
  {
    num: '10',
    title: 'Pro 功能',
    body: '订阅 Pro 解锁进阶的用量治理能力。部分已经上线，部分在规划中：',
    bullets: [
      '预算与超支告警：为供应商设置预算上限，接近或超出时提醒（已上线）',
      '用量分析与导出：更细粒度的费用/Token 分析与数据导出（已上线）',
      '智能路由：按成本、延迟或成功率在多家上游间自动择优（规划中）',
      '多 Key 轮换：为同一供应商配置多把 API Key 并自动轮换，规避单 Key 限流（规划中）',
    ],
  },
  {
    num: '11',
    title: '订阅与买断',
    body: '基础的浏览、安装、本地代理与消耗仪表盘对所有用户免费。需要 Pro 功能时可按月、按年订阅，或一次性买断终身授权：',
    bullets: [
      'Free：浏览与安装资源、本地代理转发、消耗仪表盘',
      'Pro 月付：$7 / 月',
      'Pro 年付：$70 / 年',
      '终身买断：$99（一次付费，永久 Pro）',
    ],
  },
]

export default function DocsPage() {
  function scrollTo(num: string) {
    const container = document.getElementById('docs-scroll')
    const el = document.getElementById(`docsec-${num}`)
    if (container && el) {
      container.scrollTop += el.getBoundingClientRect().top - container.getBoundingClientRect().top - 16
    }
  }

  return (
    <div className="flex h-[calc(100vh-61px)] min-h-0 bg-store-content">
      {/* left nav */}
      <div className="w-[236px] flex-shrink-0 overflow-y-auto border-r border-store-border px-3.5 py-7">
        <div className="px-2.5 pb-3 text-[11px] font-bold uppercase tracking-wide text-store-text-3">指南</div>
        <div className="flex flex-col gap-0.5">
          {DOCS.map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => scrollTo(s.num)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-store-panel-2"
            >
              <span className="shrink-0 font-mono text-[11px] font-bold text-store-accent">{s.num}</span>
              <span className="truncate text-[13px] text-store-text-2">{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div id="docs-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-10 pb-16 pt-10">
          <div className="text-3xl font-extrabold tracking-tight text-store-text">开始使用 Agent Store</div>
          <div className="mt-2.5 text-sm leading-relaxed text-store-text-2">
            发现、安装并管理面向 Claude Code / Codex 的技能、MCP 与模型供应商。
          </div>
          {DOCS.map((s) => (
            <div key={s.num} id={`docsec-${s.num}`} className="mt-[34px] border-t border-store-border pt-7">
              <div className="mb-3 flex items-center gap-[11px]">
                <span className="font-mono text-xs font-extrabold text-store-accent">{s.num}</span>
                <span className="text-[19px] font-bold tracking-tight text-store-text">{s.title}</span>
              </div>
              <div className="text-sm leading-[1.75] text-store-text-2">{s.body}</div>
              {s.bullets && (
                <ul className="mt-3 flex flex-col gap-2">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-2.5 text-sm leading-[1.7] text-store-text-2">
                      <span className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-store-accent" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.code && (
                <div className="mt-3.5 whitespace-pre-wrap rounded-[11px] border border-store-border bg-store-term-bg px-4 py-3.5 font-mono text-[12.5px] leading-[1.8] text-[#c7c7d0]">
                  {s.code}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
