type Point = { label: string; value: number }

export const CHART_COLORS = [
  '#2563eb',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#ec4899',
]

// Line chart with optional target line + area fill
export function LineChart({
  data,
  target,
  color = '#2563eb',
  yMin,
  yMax,
  suffix = '',
  height = 240,
}: {
  data: Array<Point>
  target?: number
  color?: string
  yMin?: number
  yMax?: number
  suffix?: string
  height?: number
}) {
  const W = 760
  const H = height
  const padL = 38
  const padR = 16
  const padT = 14
  const padB = 26
  const values = data.map((d) => d.value)
  const lo = yMin ?? Math.floor(Math.min(...values, target ?? Infinity) - 3)
  const hi = yMax ?? Math.ceil(Math.max(...values, target ?? -Infinity) + 3)
  const span = hi - lo || 1
  const x = (i: number) =>
    padL + (i * (W - padL - padR)) / Math.max(1, data.length - 1)
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB)

  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const area = `${padL},${y(lo)} ${line} ${x(data.length - 1)},${y(lo)}`
  const ticks = 4
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => lo + (span * i) / ticks)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {gridVals.map((gv, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke="#eef2f7" />
          <text x={4} y={y(gv) + 3} fontSize="10" fill="#94a3b8">
            {Math.round(gv)}
            {suffix}
          </text>
        </g>
      ))}
      <defs>
        <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g-${color})`} />
      {target !== undefined ? (
        <line
          x1={padL}
          x2={W - padR}
          y1={y(target)}
          y2={y(target)}
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      ) : null}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r="2.5" fill={color} />
      ))}
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor="middle">
          {d.label}
        </text>
      ))}
    </svg>
  )
}

// Vertical bar chart
export function BarChart({
  data,
  colors,
  suffix = '',
  height = 240,
}: {
  data: Array<Point>
  colors?: Array<string>
  suffix?: string
  height?: number
}) {
  const W = 760
  const H = height
  const padL = 40
  const padR = 12
  const padT = 14
  const padB = 28
  const max = Math.max(...data.map((d) => d.value), 1)
  const hi = Math.ceil(max / 50) * 50 || max
  const bw = (W - padL - padR) / data.length
  const y = (v: number) => padT + (1 - v / hi) * (H - padT - padB)
  const ticks = 4
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {Array.from({ length: ticks + 1 }, (_, i) => (hi * i) / ticks).map((gv, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke="#eef2f7" />
          <text x={4} y={y(gv) + 3} fontSize="10" fill="#94a3b8">
            {Math.round(gv)}
            {suffix}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const h = (d.value / hi) * (H - padT - padB)
        const c = (colors ?? CHART_COLORS)[i % (colors ?? CHART_COLORS).length]
        return (
          <g key={i}>
            <rect
              x={padL + i * bw + bw * 0.22}
              y={H - padB - h}
              width={bw * 0.56}
              height={h}
              rx="4"
              fill={c}
            />
            <text
              x={padL + i * bw + bw / 2}
              y={H - 9}
              fontSize="10"
              fill="#64748b"
              textAnchor="middle"
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Horizontal bars (ranking / funnel)
export function HBars({
  data,
  color = '#ef4444',
  showValue = true,
  valueInside = false,
  colorByIndex = false,
  barColors,
}: {
  data: Array<Point>
  color?: string
  showValue?: boolean
  valueInside?: boolean
  colorByIndex?: boolean
  barColors?: Array<string>
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const barColor = (i: number) =>
    barColors?.[i] ?? (colorByIndex ? CHART_COLORS[i % CHART_COLORS.length] : color)
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-24 shrink-0 text-right text-xs text-slate-500">
            {d.label}
          </div>
          <div className="relative h-6 flex-1 rounded bg-slate-100">
            <div
              className="flex h-6 items-center justify-end rounded px-2 text-[11px] font-semibold text-white"
              style={{
                width: `${Math.max((d.value / max) * 100, valueInside ? 8 : 2)}%`,
                background: barColor(i),
              }}
            >
              {valueInside && showValue ? d.value : ''}
            </div>
            {!valueInside && showValue ? (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-600">
                {d.value}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

// Donut chart with legend
export function Donut({
  data,
  suffix = '%',
}: {
  data: Array<Point>
  suffix?: string
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const R = 70
  const r = 44
  const cx = 90
  const cy = 90
  let angle = -Math.PI / 2
  const arcs = data.map((d, i) => {
    const frac = d.value / total
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0 = cx + R * Math.cos(a0)
    const y0 = cy + R * Math.sin(a0)
    const x1 = cx + R * Math.cos(a1)
    const y1 = cy + R * Math.sin(a1)
    const xi1 = cx + r * Math.cos(a1)
    const yi1 = cy + r * Math.sin(a1)
    const xi0 = cx + r * Math.cos(a0)
    const yi0 = cy + r * Math.sin(a0)
    const dpath = `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`
    return <path key={i} d={dpath} fill={CHART_COLORS[i % CHART_COLORS.length]} />
  })
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0">
        {arcs}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 sm:max-w-[220px]">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {d.label} {d.value}
            {suffix}
          </div>
        ))}
      </div>
    </div>
  )
}

// Progress / pipeline bar
export function ProgressRow({
  label,
  value,
  max,
  color = '#2563eb',
}: {
  label: string
  value: number
  max: number
  color?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0 text-xs text-slate-500">{label}</div>
      <div className="h-5 flex-1 rounded-full bg-slate-100">
        <div
          className="flex h-5 items-center rounded-full px-2 text-[11px] font-semibold text-white"
          style={{ width: `${Math.max((value / max) * 100, 6)}%`, background: color }}
        >
          {value}
        </div>
      </div>
      <div className="w-8 shrink-0 text-right text-xs font-medium text-slate-500">
        {value}
      </div>
    </div>
  )
}

// Attendance heatmap row
export function Heatmap({ data }: { data: Array<Point> }) {
  const cell = (p: number) =>
    p >= 90
      ? 'bg-emerald-100 text-emerald-700'
      : p >= 80
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700'
  return (
    <div>
      <div className="grid grid-cols-5 gap-3">
        {data.map((d, i) => (
          <div key={i} className="text-center">
            <div className="mb-1 text-xs text-slate-400">{d.label}</div>
            <div className={`rounded-lg py-3 text-sm font-semibold ${cell(d.value)}`}>
              {d.value}%
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200" /> 90%+ Good
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" /> 80–89%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200" /> &lt;80%
        </span>
      </div>
    </div>
  )
}
