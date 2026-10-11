import type { PriceRow } from "./data";

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** close >= open: drawn hollow; down candles are drawn filled. */
  up: boolean;
}

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Convert price rows to candles, ordered by date. Rows without a valid close are dropped.
 * A missing/invalid open falls back to the previous close (or this close), and high/low are
 * widened to contain open and close. Trading gaps are not filled: one row is one candle.
 */
export function toCandles(rows: PriceRow[]): Candle[] {
  const sorted = [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out: Candle[] = [];
  for (const [date, o, h, l, c, v] of sorted) {
    if (!ok(c)) continue;
    if (out.length && out[out.length - 1].date === date) out.pop();
    const open = ok(o) ? o : out.length ? out[out.length - 1].close : c;
    const high = Math.max(open, c, ok(h) ? h : 0);
    const low = Math.min(open, c, ok(l) ? l : Infinity);
    out.push({ date, open, high, low, close: c, volume: Number.isFinite(v) ? v : 0, up: c >= open });
  }
  return out;
}
