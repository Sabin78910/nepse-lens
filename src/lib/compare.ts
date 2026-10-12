// Pure logic for the side-by-side stock comparison: URL state, rebased price lines and table stats.
import { netByBroker, topAccumulators, type AccumDoc } from "./accumulation";
import type { PriceRow } from "./data";
import { highLow } from "./indicators";

export const MAX_COMPARE = 4;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CompareState {
  symbols: string[];
  from: string | null;
}

/** Reads `#/compare/NABIL,NICA?from=YYYY-MM-DD`. Symbols are upper-cased, de-duplicated and capped. */
export function parseCompare(hash: string): CompareState {
  const [path, query = ""] = hash.split("?");
  const list = decodeURIComponent(path.split("/")[2] ?? "");
  const symbols = [...new Set(list.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, MAX_COMPARE);
  const from = new URLSearchParams(query).get("from");
  return { symbols, from: from && DATE.test(from) ? from : null };
}

export function compareHash(symbols: string[], from: string | null): string {
  return `#/compare/${symbols.map(encodeURIComponent).join(",")}${from ? `?from=${from}` : ""}`;
}

export function toggleSymbol(symbols: string[], symbol: string): string[] {
  if (symbols.includes(symbol)) return symbols.filter((s) => s !== symbol);
  return symbols.length >= MAX_COMPARE ? symbols : [...symbols, symbol];
}

export interface Normalised {
  start: string | null;
  dates: string[];
  /** Percent change from the start date's close, per symbol, aligned to `dates`. */
  lines: Record<string, number[]>;
}

/** Rebases each series to 0% on a common start: the first date every symbol traded on, on or after `from`. */
export function normalise(series: Record<string, PriceRow[]>, from: string | null = null): Normalised {
  const syms = Object.keys(series);
  const empty: Normalised = { start: null, dates: [], lines: {} };
  if (!syms.length) return empty;
  const closes = new Map(syms.map((s) => [s, new Map(series[s].map((r) => [r[0], r[4]]))]));
  const shared = [...closes.get(syms[0])!.keys()].filter((d) => (!from || d >= from) && syms.every((s) => closes.get(s)!.has(d))).sort();
  if (!shared.length) return empty;
  const lines: Record<string, number[]> = {};
  for (const s of syms) {
    const m = closes.get(s)!;
    const base = m.get(shared[0])!;
    lines[s] = shared.map((d) => (base ? Math.round(((m.get(d)! / base - 1) * 100) * 100) / 100 : 0));
  }
  return { start: shared[0], dates: shared, lines };
}

export function weekRange(rows: PriceRow[]): { low: number; high: number } | null {
  return highLow(rows.slice(-260).map((r) => r[4]));
}

/** Combined net quantity of the top-n accumulating brokers since collection began (not holdings). */
export function topAccumulation(doc: AccumDoc | null, marketDays: string[], n = 5): number | null {
  if (!doc) return null;
  return topAccumulators(netByBroker(doc, "ALL", marketDays), n).reduce((a, r) => a + r.netQty, 0);
}
