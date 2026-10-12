// Pure watchlist helpers (sort, reorder) and the per-session sparkline loader.
import { loadData, type Mode, type Sources } from "./api";
import type { PriceRow, Stock } from "./data";

export type SortMode = "manual" | "change" | "turnover" | "name";
export const SORT_MODES: SortMode[] = ["manual", "change", "turnover", "name"];
export const SPARK_DAYS = 30;

export function isSortMode(x: unknown): x is SortMode {
  return typeof x === "string" && (SORT_MODES as string[]).includes(x);
}

/** Returns a new list; "manual" keeps the user's own order. */
export function sortStocks(stocks: Stock[], mode: SortMode): Stock[] {
  const out = [...stocks];
  if (mode === "change") out.sort((a, b) => b.pct - a.pct);
  else if (mode === "turnover") out.sort((a, b) => b.turnover - a.turnover);
  else if (mode === "name") out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

/** Moves one item a step up (-1) or down (+1); out-of-range or unknown items leave the list unchanged. */
export function moveItem(list: string[], item: string, dir: -1 | 1): string[] {
  const i = list.indexOf(item);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function lastCloses(rows: PriceRow[], n = SPARK_DAYS): number[] {
  return rows.slice(-n).map((r) => r[4]);
}

const cache = new Map<string, Promise<number[]>>();

export function resetSparkCache(): void {
  cache.clear();
}

/** Last 30 closes for a symbol, fetched lazily and cached for the session. Missing history gives []. */
export function loadSparkline(src: Sources, mode: Mode, symbol: string, fetcher?: (url: string) => Promise<Response>): Promise<number[]> {
  const key = `${mode}:${symbol}`;
  let p = cache.get(key);
  if (!p) {
    p = loadData<{ d: PriceRow[] }>(src, mode, `prices/${symbol}.json`, fetcher).then((d) => lastCloses(d?.d ?? []));
    cache.set(key, p);
  }
  return p;
}
