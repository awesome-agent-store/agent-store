import type { UsageSummaryRow } from '@aas/types'

const WIDTH = 680
const HEIGHT = 190
const PAD_LEFT = 34
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 26
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM

// Round a max value up to a "nice" tick ceiling (1/2/5/10 * 10^n), mirroring the
// mockup's `Math.ceil(tMax / 20) * 20` for its fixed sample-data scale, generalized
// to work across the real (much smaller) cost values this chart actually renders.
function niceCeil(max: number): number {
  if (max <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const residual = max / magnitude
  let unit: number
  if (residual > 5) unit = 10
  else if (residual > 2) unit = 5
  else if (residual > 1) unit = 2
  else unit = 1
  return unit * magnitude
}

function formatDateLabel(date: string): string {
  const parts = date.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`
  return date
}

export function UsageTrendChart({ rows }: { rows: UsageSummaryRow[] }) {
  const byDate = new Map<string, number>()
  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.costUsd)
  }
  const dates = [...byDate.keys()].sort()

  if (dates.length === 0) {
    return (
      <div className="relative flex h-[116px] items-center justify-center text-xs text-store-text-3">
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0" />
        <span>暂无用量数据</span>
      </div>
    )
  }

  const costs = dates.map((d) => byDate.get(d)!)
  const niceMax = niceCeil(Math.max(...costs, 0.0001))
  const x = (i: number) => PAD_LEFT + (dates.length === 1 ? PLOT_WIDTH / 2 : (i / (dates.length - 1)) * PLOT_WIDTH)
  const y = (v: number) => PAD_TOP + PLOT_HEIGHT - (v / niceMax) * PLOT_HEIGHT

  const points = dates.map((d, i) => ({ x: x(i), y: y(byDate.get(d)!), d }))
  const pointsAttr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const bottomY = (PAD_TOP + PLOT_HEIGHT).toFixed(1)
  const areaPoints = `${PAD_LEFT},${bottomY} ${pointsAttr} ${x(dates.length - 1).toFixed(1)},${bottomY}`

  const yLabels = [0, 0.33, 0.66, 1].map((f, i) => {
    const v = Math.round(niceMax * f)
    return { key: i, y: y(v), label: String(v) }
  })

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-[116px] w-full"
    >
      {yLabels.map((g) => (
        <line
          key={`grid-${g.key}`}
          x1={PAD_LEFT}
          y1={g.y}
          x2={WIDTH - PAD_RIGHT}
          y2={g.y}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}
      {yLabels.map((g) => (
        <text
          key={`ylabel-${g.key}`}
          x={PAD_LEFT - 8}
          y={g.y}
          fill="var(--text-3)"
          fontSize={11}
          textAnchor="end"
          dominantBaseline="middle"
          className="font-mono"
        >
          {g.label}
        </text>
      ))}
      <polygon points={areaPoints} fill="rgba(93,95,239,0.10)" />
      <polyline points={pointsAttr} fill="none" stroke="#5d5fef" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p) => (
        <circle key={`dot-${p.d}`} cx={p.x} cy={p.y} r={3.4} fill="var(--panel)" stroke="#5d5fef" strokeWidth={2} />
      ))}
      {points.map((p) => (
        <text key={`xlabel-${p.d}`} x={p.x} y={182} fill="var(--text-3)" fontSize={10.5} textAnchor="middle" className="font-mono">
          {formatDateLabel(p.d)}
        </text>
      ))}
    </svg>
  )
}
