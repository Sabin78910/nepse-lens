// Types for the collector's JSON and the derived market views (gainers, losers, heatmap, search).

export interface IndexInfo {
  id: number;
  name: string;
  value: number;
  change: number;
  pct: number;
  prev: number;
  high?: number | null;
  low?: number | null;
  w52High?: number | null;
  w52Low?: number | null;
}

export type StockRow = [string, number, number, number, number | null, number | null, number | null, number, number | null, string | null];

export interface Latest {
  v: number;
  source: string;
  fetchedAt: string;
  status: { isOpen: string; asOf: string };
  summary: Partial<Record<"turnover" | "shares" | "transactions" | "scrips" | "marketCap" | "floatMarketCap", number>>;
  indices: IndexInfo[];
  subindices: { id: number; name: string; value: number; change: number; pct: number }[];
  intraday: [number, number][];
  stocks: StockRow[];
}

export interface Security {
  s: string;
  n: string;
  sec: string;
  id: number;
}

export interface Stock {
  symbol: string;
  name: string;
  sector: string;
  ltp: number;
  pct: number;
  change: number;
  prevClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  qty: number;
  turnover: number;
}

export function toStocks(latest: Latest, securities: Security[]): Stock[] {
  const meta = new Map(securities.map((s) => [s.s, s]));
  return latest.stocks.map(([symbol, ltp, pct, prev, open, high, low, qty, turnover]) => {
    const m = meta.get(symbol);
    return {
      symbol,
      name: m?.n ?? symbol,
      sector: m?.sec ?? "Others",
      ltp,
      pct,
      change: Math.round((ltp - prev) * 100) / 100,
      prevClose: prev,
      open,
      high,
      low,
      qty,
      turnover: turnover ?? ltp * qty,
    };
  });
}

const traded = (s: Stock) => s.qty > 0;

export function topGainers(stocks: Stock[], n = 10): Stock[] {
  return stocks.filter((s) => traded(s) && s.pct > 0).sort((a, b) => b.pct - a.pct || a.symbol.localeCompare(b.symbol)).slice(0, n);
}

export function topLosers(stocks: Stock[], n = 10): Stock[] {
  return stocks.filter((s) => traded(s) && s.pct < 0).sort((a, b) => a.pct - b.pct || a.symbol.localeCompare(b.symbol)).slice(0, n);
}

export function mostActive(stocks: Stock[], n = 10): Stock[] {
  return stocks.filter(traded).sort((a, b) => b.turnover - a.turnover).slice(0, n);
}

export function breadth(stocks: Stock[]): { up: number; down: number; flat: number } {
  const t = stocks.filter(traded);
  return {
    up: t.filter((s) => s.pct > 0).length,
    down: t.filter((s) => s.pct < 0).length,
    flat: t.filter((s) => s.pct === 0).length,
  };
}

export interface SectorTile {
  sector: string;
  turnover: number;
  /** Turnover-weighted average % change of traded stocks. */
  pct: number;
  count: number;
}

export function sectorHeatmap(stocks: Stock[]): SectorTile[] {
  const m = new Map<string, { t: number; w: number; c: number }>();
  for (const s of stocks) {
    if (!traded(s) || s.sector === "Promoter Share" || /Debenture|Bond/i.test(s.sector)) continue;
    const e = m.get(s.sector) ?? { t: 0, w: 0, c: 0 };
    e.t += s.turnover;
    e.w += s.pct * s.turnover;
    e.c += 1;
    m.set(s.sector, e);
  }
  return [...m.entries()]
    .map(([sector, e]) => ({ sector, turnover: e.t, pct: e.t ? Math.round((e.w / e.t) * 100) / 100 : 0, count: e.c }))
    .sort((a, b) => b.turnover - a.turnover);
}

/** Symbol prefix matches first, then name matches. Case-insensitive. */
export function search(securities: Security[], query: string, n = 20): Security[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: Security[] = [];
  const prefix: Security[] = [];
  const name: Security[] = [];
  for (const s of securities) {
    const sym = s.s.toLowerCase();
    if (sym === q) exact.push(s);
    else if (sym.startsWith(q)) prefix.push(s);
    else if (s.n.toLowerCase().includes(q)) name.push(s);
  }
  prefix.sort((a, b) => a.s.length - b.s.length || a.s.localeCompare(b.s));
  return [...exact, ...prefix, ...name].slice(0, n);
}

/** Price history rows: [date, open, high, low, close, volume, turnover]. */
export type PriceRow = [string, number, number, number, number, number, number];

export function isLatest(x: unknown): x is Latest {
  const o = x as Latest;
  return !!o && typeof o === "object" && Array.isArray(o.stocks) && Array.isArray(o.indices) && !!o.status;
}
