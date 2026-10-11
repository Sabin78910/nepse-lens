import { useId, useMemo, useState } from "react";
import { macd, rsi, sma, type Series } from "../lib/indicators";
import type { Candle } from "../lib/candles";
import { Segmented } from "./ui";
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

export type Bar = Candle;
type Mode = "line" | "candles";
type Panel = "none" | "rsi" | "macd";

const PH = 90;

function seriesPath(v: Series, x: (i: number) => number, y: (n: number) => number): string {
  let d = "";
  v.forEach((n, i) => {
    if (n != null) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)}`;
  });
  return d;
}

/** RSI(14) with 30/70 guides, or MACD line, signal and histogram, aligned with the price x-axis. */
function IndicatorPanel({ kind, closes, W, xs, step, index }: { kind: "rsi" | "macd"; closes: number[]; W: number; xs: (i: number) => number; step: number; index: number }) {
  const m = useMemo(() => (kind === "macd" ? macd(closes) : null), [kind, closes]);
  const r = useMemo(() => (kind === "rsi" ? rsi(closes, 14) : null), [kind, closes]);
  const vals = (r ?? [...m!.line, ...m!.signal, ...m!.hist]).filter((n): n is number => n != null);
  if (!vals.length) return <p className="muted">Not enough history for {kind === "rsi" ? "RSI 14" : "MACD"}.</p>;
  const lo = kind === "rsi" ? 0 : Math.min(...vals, 0);
  const hi = kind === "rsi" ? 100 : Math.max(...vals, 0);
  const y = (n: number) => PH - 6 - ((n - lo) / (hi - lo || 1)) * (PH - 12);
  const at = (s: Series | undefined) => s?.[index];
  const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));
  return (
    <div className="chart-panel">
      <div className="chart-readout tabular">
        {kind === "rsi" ? (
          <span>RSI 14 <strong>{fmt(at(r!))}</strong></span>
        ) : (
          <span>MACD <strong>{fmt(at(m!.line))}</strong> · Signal {fmt(at(m!.signal))} · Hist {fmt(at(m!.hist))}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${PH}`} preserveAspectRatio="none" role="img" aria-label={kind === "rsi" ? "RSI 14" : "MACD"}>
        {kind === "rsi" ? (
          <>
            {[30, 70].map((g) => (
              <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} className="guide" />
            ))}
            <path d={seriesPath(r!, xs, y)} fill="none" stroke="var(--gold)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          <>
            <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="guide" />
            {m!.hist.map((v, i) =>
              v == null ? null : (
                <rect key={i} x={xs(i) - step * 0.35} width={Math.max(1, step * 0.7)} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} fill={v >= 0 ? "var(--up)" : "var(--down)"} opacity="0.5" />
              ),
            )}
            <path d={seriesPath(m!.line, xs, y)} fill="none" stroke="var(--text)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            <path d={seriesPath(m!.signal, xs, y)} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {kind === "rsi" && (
        <div className="chart-axis tabular muted">
          <span>30</span>
          <span>70</span>
        </div>
      )}
    </div>
  );
}

/** Close-price area chart with a 20-day average, volume bars and a touch/hover crosshair. */
export function PriceChart({ bars, lang }: { bars: Bar[]; lang: Lang }) {
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("line");
  const [panel, setPanel] = useState<Panel>("none");
  const W = 640;
  const H = 260;
  const VH = 50;
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const ma = useMemo(() => sma(closes, 20), [closes]);
  const id = useId();
  if (bars.length < 2) return <p className="muted">—</p>;
  const lo = Math.min(...(mode === "candles" ? bars.map((b) => b.low) : closes));
  const hi = Math.max(...(mode === "candles" ? bars.map((b) => b.high) : closes));
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
      <div className="chart-controls">
        <Segmented label="Chart type" value={mode} onChange={setMode} options={[{ value: "line", label: "Line" }, { value: "candles", label: "Candles" }]} />
        <Segmented label="Indicator" value={panel} onChange={setPanel} options={[{ value: "none", label: "None" }, { value: "rsi", label: "RSI 14" }, { value: "macd", label: "MACD" }]} />
      </div>
      <figcaption className="chart-readout tabular">
        <span>{h.date}</span>
        {mode === "candles" ? (
          <span>O {formatPrice(h.open, lang)} H {formatPrice(h.high, lang)} L {formatPrice(h.low, lang)} C <strong>{formatPrice(h.close, lang)}</strong></span>
        ) : (
          <strong>{formatPrice(h.close, lang)}</strong>
        )}
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
        {mode === "line" ? (
          <>
            <path d={`${d}L${W - 6},${H - VH}L6,${H - VH}Z`} fill={`url(#${id})`} />
            <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        ) : (
          bars.map((b, i) => {
            const c = b.up ? "var(--up)" : "var(--down)";
            const bw = Math.max(1.5, step * 0.7);
            const top = ys(Math.max(b.open, b.close));
            return (
              <g key={b.date}>
                <line x1={xs(i)} x2={xs(i)} y1={ys(b.high)} y2={ys(b.low)} stroke={c} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                <rect x={xs(i) - bw / 2} width={bw} y={top} height={Math.max(1.5, Math.abs(ys(b.open) - ys(b.close)))} stroke={c} strokeWidth="1.2" vectorEffect="non-scaling-stroke" fill={b.up ? "var(--bg)" : c} />
              </g>
            );
          })
        )}
        {maD && <path d={maD} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {hover != null && (
          <g>
            <line x1={xs(hover)} x2={xs(hover)} y1="0" y2={H} className="cross" />
            {mode === "line" && <circle cx={xs(hover)} cy={ys(bars[hover].close)} r="4" fill={color} />}
          </g>
        )}
      </svg>
      <div className="chart-axis tabular muted">
        <span>{formatPrice(lo, lang)}</span>
        <span>{formatPrice(hi, lang)}</span>
      </div>
      {panel !== "none" && <IndicatorPanel kind={panel} closes={closes} W={W} xs={xs} step={step} index={hover ?? bars.length - 1} />}
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
