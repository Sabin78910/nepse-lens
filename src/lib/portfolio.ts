// Portfolio holdings from a list of buy/sell transactions, with WACC (fees included) and P/L.

import { buyCost, sellResult } from "./fees";

export interface Txn {
  id: string;
  symbol: string;
  side: "buy" | "sell" | "bonus";
  qty: number;
  price: number;
  date: string; // YYYY-MM-DD
}

export interface Holding {
  symbol: string;
  qty: number;
  wacc: number;
  invested: number;
  realized: number;
  firstBuy: string | null;
}

/** Weighted average cost. Buys add their fees; bonus shares add quantity at zero cost; sells keep WACC unchanged. */
export function holdings(txns: Txn[]): Holding[] {
  const m = new Map<string, Holding>();
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    const h = m.get(t.symbol) ?? { symbol: t.symbol, qty: 0, wacc: 0, invested: 0, realized: 0, firstBuy: null };
    if (t.side === "buy" || t.side === "bonus") {
      const cost = t.side === "buy" ? buyCost(t.qty, t.price).total : 0;
      h.invested += cost;
      h.qty += t.qty;
      h.wacc = h.qty ? h.invested / h.qty : 0;
      h.firstBuy = h.firstBuy ?? t.date;
    } else {
      const q = Math.min(t.qty, h.qty);
      if (q > 0) {
        const days = h.firstBuy ? daysBetween(h.firstBuy, t.date) : 0;
        h.realized += sellResult(q, t.price, h.wacc, days).netProfit;
        h.qty -= q;
        h.invested = h.qty * h.wacc;
        if (h.qty === 0) {
          h.wacc = 0;
          h.firstBuy = null;
        }
      }
    }
    m.set(t.symbol, h);
  }
  return [...m.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export interface Valued extends Holding {
  ltp: number | null;
  value: number;
  /** Profit if sold now at LTP, after sell fees and capital gains tax. */
  unrealized: number;
  unrealizedPct: number;
  dayChange: number;
}

export function valueHoldings(hs: Holding[], prices: Map<string, { ltp: number; change: number }>, today: string): Valued[] {
  return hs
    .filter((h) => h.qty > 0)
    .map((h) => {
      const p = prices.get(h.symbol);
      const ltp = p?.ltp ?? null;
      const value = ltp != null ? ltp * h.qty : h.invested;
      const unrealized = ltp != null ? sellResult(h.qty, ltp, h.wacc, h.firstBuy ? daysBetween(h.firstBuy, today) : 0).netProfit : 0;
      return {
        ...h,
        ltp,
        value,
        unrealized,
        unrealizedPct: h.invested ? (unrealized / h.invested) * 100 : 0,
        dayChange: p ? p.change * h.qty : 0,
      };
    });
}

export function totals(vs: Valued[]) {
  const invested = vs.reduce((a, v) => a + v.invested, 0);
  const value = vs.reduce((a, v) => a + v.value, 0);
  const unrealized = vs.reduce((a, v) => a + v.unrealized, 0);
  const day = vs.reduce((a, v) => a + v.dayChange, 0);
  return { invested, value, unrealized, unrealizedPct: invested ? (unrealized / invested) * 100 : 0, day };
}
