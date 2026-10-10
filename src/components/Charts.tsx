import { useId, useMemo, useState } from "react";
import { sma } from "../lib/indicators";
import { formatCompact, formatPrice, type Lang } from "../lib/format";

function path(values: number[], w: number, h: number, pad = 2, min?: number, max?: number): string {
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  return values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - lo) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

export function Sparkline({ values, up, width = 120, height = 36, label }: { values: number[]; up: boolean; width?: number; height?: number; label: string }) {
  const id = useId();
  if (values.length < 2) return null;
  const d = path(values, width, height);
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${width - 2},${height}L2,${height}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export interface Bar {
  date: string;
  close: number;
  volume: number;
}

/** Close-price area chart with a 20-day average, volume bars and a touch/hover crosshair. */
export function PriceChart({ bars, lang }: { bars: Bar[]; lang: Lang }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 260;
  const VH = 50;
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const ma = useMemo(() => sma(closes, 20), [closes]);
  const id = useId();
  if (bars.length < 2) return <p className="muted">—</p>;
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const up = closes[closes.length - 1] >= closes[0];
  const color = up ? "var(--up)" : "var(--down)";
  const d = path(closes, W, H - VH, 6, lo, hi);
  const maVals = ma.map((v, i) => v ?? closes[i]);
  const firstMa = ma.findIndex((v) => v != null);
  const maD = firstMa >= 0 ? path(maVals, W, H - VH, 6, lo, hi).split(/(?=[ML])/).slice(firstMa).join("").replace(/^L/, "M") : "";
  const vmax = Math.max(...bars.map((b) => b.volume)) || 1;
  const step = (W - 12) / Math.max(1, bars.length - 1);
  const xs = (i: number) => 6 + i * step;
  const ys = (v: number) => H - VH - 6 - ((v - lo) / (hi - lo || 1)) * (H - VH - 12);
  const h = hover != null ? bars[hover] : bars[bars.length - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(bars.length - 1, Math.round((x - 6) / step))));
  };

  return (
    <figure className="chart">
      <figcaption className="chart-readout tabular">
        <span>{h.date}</span>
        <strong>{formatPrice(h.close, lang)}</strong>
        <span className="muted">Vol {formatCompact(h.volume, lang)}</span>
        {hover == null && <span className="legend"><i className="dot ma" /> 20D avg</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Price chart, ${bars[0].date} to ${bars[bars.length - 1].date}`}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={(H - VH) * f} y2={(H - VH) * f} className="grid" />
        ))}
        {bars.map((b, i) => (
          <rect key={b.date} x={xs(i) - step * 0.35} width={Math.max(1, step * 0.7)} y={H - (b.volume / vmax) * (VH - 4)} height={(b.volume / vmax) * (VH - 4)} className="vol" />
        ))}
        <path d={`${d}L${W - 6},${H - VH}L6,${H - VH}Z`} fill={`url(#${id})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {maD && <path d={maD} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {hover != null && (
          <g>
            <line x1={xs(hover)} x2={xs(hover)} y1="0" y2={H} className="cross" />
            <circle cx={xs(hover)} cy={ys(bars[hover].close)} r="4" fill={color} />
          </g>
        )}
      </svg>
      <div className="chart-axis tabular muted">
        <span>{formatPrice(lo, lang)}</span>
        <span>{formatPrice(hi, lang)}</span>
      </div>
    </figure>
  );
}

/** Diverging horizontal bars: accumulation to the right (green), distribution to the left (red). */
export function NetBars({ rows, name, lang }: { rows: { broker: number; netQty: number }[]; name: (b: number) => string; lang: Lang }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.netQty)));
  return (
    <ul className="netbars" aria-label="Net quantity by broker">
      {rows.map((r) => {
        const up = r.netQty > 0;
        const w = (Math.abs(r.netQty) / max) * 50;
        return (
          <li key={r.broker}>
            <span className="nb-name" title={name(r.broker)}>#{r.broker}</span>
            <span className="nb-track">
              <span className={`nb-bar ${up ? "up" : "down"}`} style={{ width: `${w}%`, [up ? "left" : "right"]: "50%" }} />
            </span>
            <span className={`nb-val tabular ${up ? "up" : "down"}`}>
              {up ? "▲" : "▼"} {formatCompact(Math.abs(r.netQty), lang)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
