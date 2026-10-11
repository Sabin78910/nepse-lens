// Broker accumulation = cumulative net (buy - sell) per broker for one stock, from floorsheets collected
// since collection began. It is NOT a broker's holdings: NEPSE does not publish holdings.

export type Window = "1D" | "1W" | "1M" | "3M" | "ALL";
export const WINDOW_DAYS: Record<Window, number> = { "1D": 1, "1W": 5, "1M": 22, "3M": 66, ALL: 0 };

/** Shape written by the collector: rows are [dateIndex, broker, buyQty, sellQty, buyAmt, sellAmt]. */
export interface AccumDoc {
  s: string;
  dates: string[];
  r: [number, number, number, number, number, number][];
}

/** Days older than the collector's daily window are rolled into monthly rows dated 'YYYY-MM'. */
export const isRollup = (date: string): boolean => date.length === 7;

export interface BrokerNet {
  broker: number;
  buyQty: number;
  sellQty: number;
  buyAmt: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
  avgBuy: number | null;
  avgSell: number | null;
}

/**
 * Indices of the dates that fall inside the window. Windows count trading days that the stock traded on,
 * ending at `allDates`' last day (the latest collected market day), so a stock that did not trade recently
 * shows only what fits in the window.
 */
export function windowDates(doc: AccumDoc, window: Window, allDates?: string[]): Set<number> {
  const n = WINDOW_DAYS[window];
  if (n === 0) return new Set(doc.dates.map((_, i) => i));
  const market = (allDates && allDates.length ? [...allDates] : [...doc.dates]).filter((d) => !isRollup(d)).sort();
  const keep = new Set(market.slice(-n));
  const out = new Set<number>();
  doc.dates.forEach((d, i) => !isRollup(d) && keep.has(d) && out.add(i));
  return out;
}

export function netByBroker(doc: AccumDoc, window: Window, allDates?: string[]): BrokerNet[] {
  const idx = windowDates(doc, window, allDates);
  const m = new Map<number, BrokerNet>();
  for (const [di, broker, bq, sq, ba, sa] of doc.r) {
    if (!idx.has(di)) continue;
    let b = m.get(broker);
    if (!b) {
      b = { broker, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, netQty: 0, netAmt: 0, avgBuy: null, avgSell: null };
      m.set(broker, b);
    }
    b.buyQty += bq;
    b.sellQty += sq;
    b.buyAmt += ba;
    b.sellAmt += sa;
  }
  for (const b of m.values()) {
    b.netQty = b.buyQty - b.sellQty;
    b.netAmt = b.buyAmt - b.sellAmt;
    b.avgBuy = b.buyQty ? b.buyAmt / b.buyQty : null;
    b.avgSell = b.sellQty ? b.sellAmt / b.sellQty : null;
  }
  return [...m.values()];
}

export function topAccumulators(rows: BrokerNet[], n = 10): BrokerNet[] {
  return rows.filter((r) => r.netQty > 0).sort((a, b) => b.netQty - a.netQty || a.broker - b.broker).slice(0, n);
}

export function topDistributors(rows: BrokerNet[], n = 10): BrokerNet[] {
  return rows.filter((r) => r.netQty < 0).sort((a, b) => a.netQty - b.netQty || a.broker - b.broker).slice(0, n);
}

/** Cumulative net quantity per day for one broker (for the accumulation chart). */
export function cumulativeNet(doc: AccumDoc, broker: number): { date: string; net: number }[] {
  const perDay = new Map<number, number>();
  for (const [di, b, bq, sq] of doc.r) if (b === broker) perDay.set(di, (perDay.get(di) ?? 0) + bq - sq);
  let run = 0;
  return doc.dates.map((date, i) => {
    run += perDay.get(i) ?? 0;
    return { date, net: run };
  });
}

/** Share of total traded volume held by the top-n accumulators' net buys (a concentration signal). */
export function concentration(rows: BrokerNet[], n = 5): number {
  const volume = rows.reduce((a, r) => a + r.buyQty, 0);
  if (!volume) return 0;
  const top = topAccumulators(rows, n).reduce((a, r) => a + r.netQty, 0);
  return (top / volume) * 100;
}
