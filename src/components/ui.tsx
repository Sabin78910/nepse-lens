import { createContext, useContext, type ReactNode } from "react";
import { ARROW, direction, formatPct, formatPrice, formatChange, type Lang } from "../lib/format";
import type { Stock } from "../lib/data";
import type { Alert } from "../lib/alerts";
import type { Txn } from "../lib/portfolio";
import type { MarketData } from "../useMarket";
import { t, type Key } from "../lib/i18n";

export interface AppState {
  data: MarketData;
  lang: Lang;
  tr: (k: Key, vars?: Record<string, string>) => string;
  go: (hash: string) => void;
  watchlist: string[];
  toggleWatch: (s: string) => void;
  setWatchlist: (list: string[]) => void;
  alerts: Alert[];
  setAlerts: (a: Alert[]) => void;
  txns: Txn[];
  setTxns: (t: Txn[]) => void;
}

export const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function makeTr(lang: Lang) {
  return (k: Key, vars?: Record<string, string>) => t(lang, k, vars);
}

/** Price change with an arrow and sign so it is readable without colour. */
export function Change({ pct, change, lang, big }: { pct: number; change?: number; lang: Lang; big?: boolean }) {
  const dir = direction(pct);
  return (
    <span className={`chg ${dir}${big ? " big" : ""} tabular`}>
      <span aria-hidden="true">{ARROW[dir]}</span> {change != null && <>{formatChange(change, lang)} </>}
      {change != null ? `(${formatPct(pct, lang)})` : formatPct(pct, lang)}
    </span>
  );
}

export function StockList({ stocks, metric = "pct" }: { stocks: Stock[]; metric?: "pct" | "turnover" }) {
  const { lang, go } = useApp();
  return (
    <ul className="stock-list">
      {stocks.map((s) => (
        <li key={s.symbol}>
          <button className="stock-row" onClick={() => go(`#/stock/${s.symbol}`)}>
            <span className="sym">
              <strong>{s.symbol}</strong>
              <small className="muted">{s.name}</small>
            </span>
            <span className="num tabular">{formatPrice(s.ltp, lang)}</span>
            <Change pct={s.pct} lang={lang} />
            {metric === "turnover" && <span className="sr-only">turnover</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
