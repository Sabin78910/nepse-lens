import { describe, expect, it } from "vitest";
import * as F from "./format";
import * as Fee from "./fees";
import * as I from "./indicators";
import * as Acc from "./accumulation";
import * as M from "./market";
import * as D from "./data";
import * as Al from "./alerts";
import * as P from "./portfolio";
import { toCandles } from "./candles";

describe("format", () => {
  it("groups numbers in the South Asian system", () => {
    expect(F.groupIndian("12345678")).toBe("1,23,45,678");
    expect(F.groupIndian("999")).toBe("999");
    expect(F.formatNumber(1234567.891)).toBe("12,34,567.89");
    expect(F.formatNumber(-100000, 0)).toBe("-1,00,000");
  });
  it("compacts into lakh, crore and arba", () => {
    expect(F.formatCompact(4837723076.79)).toBe("4.84 Arba");
    expect(F.formatCompact(25_500_000)).toBe("2.55 Cr");
    expect(F.formatCompact(2_550_000)).toBe("25.50 L");
    expect(F.formatCompact(950)).toBe("950");
    expect(F.formatCompact(4.458e12)).toBe("44.58 Kharba");
  });
  it("supports Devanagari digits and units", () => {
    expect(F.toDevanagari("2026")).toBe("२०२६");
    expect(F.formatCompact(25_500_000, "ne")).toBe("२.५५ करोड");
    expect(F.formatRs(100, "ne")).toBe("रु १००.००");
  });
  it("formats signed percent and change", () => {
    expect(F.formatPct(0.66)).toBe("+0.66%");
    expect(F.formatPct(-7.854)).toBe("-7.85%");
    expect(F.formatChange(17.15)).toBe("+17.15");
    expect(F.formatPct(null)).toBe("—");
  });
  it("gives a direction with an arrow so colour is not the only cue", () => {
    expect(F.direction(1)).toBe("up");
    expect(F.direction(-0.5)).toBe("down");
    expect(F.direction(0)).toBe("flat");
    expect(F.ARROW.up).toBe("▲");
  });
  it("labels data age", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    expect(F.ageLabel("2026-10-09T09:55:00Z", now)).toBe("5 min ago");
    expect(F.ageLabel("2026-10-09T07:00:00Z", now)).toBe("3 h ago");
    expect(F.ageLabel("bad", now)).toBe("—");
  });
});

describe("fees", () => {
  it("picks the commission slab by amount", () => {
    expect(Fee.commissionRate(50_000)).toBe(0.0036);
    expect(Fee.commissionRate(50_001)).toBe(0.0033);
    expect(Fee.commissionRate(2_000_000)).toBe(0.0031);
    expect(Fee.commissionRate(20_000_000)).toBe(0.0024);
  });
  it("applies the Rs 10 minimum commission", () => {
    expect(Fee.brokerCommission(1000)).toBe(10);
    expect(Fee.brokerCommission(100_000)).toBe(330);
  });
  it("computes buy cost with SEBON and DP fees", () => {
    const c = Fee.buyCost(100, 500);
    expect(c.amount).toBe(50000);
    expect(c.commission).toBe(180);
    expect(c.sebon).toBe(7.5);
    expect(c.dp).toBe(25);
    expect(c.total).toBe(50212.5);
    expect(c.costPerShare).toBeCloseTo(502.125);
  });
  it("taxes short-term gains at 7.5% and long-term at 5%", () => {
    expect(Fee.cgtRate(365)).toBe(0.075);
    expect(Fee.cgtRate(366)).toBe(0.05);
    const s = Fee.sellResult(100, 600, 502.125, 30);
    expect(s.amount).toBe(60000);
    expect(s.commission).toBe(198);
    expect(s.profitBeforeTax).toBe(60000 - 198 - 9 - 25 - 50212.5);
    expect(s.cgt).toBe(Math.round(s.profitBeforeTax * 0.075 * 100) / 100);
    expect(s.receivable).toBe(Math.round((60000 - 198 - 9 - 25 - s.cgt) * 100) / 100);
  });
  it("charges no CGT on a loss", () => {
    expect(Fee.sellResult(100, 400, 502, 10).cgt).toBe(0);
  });
  it("finds the break-even price above WACC", () => {
    const be = Fee.breakEvenPrice(100, 502.125);
    expect(be).toBeGreaterThan(502.125);
    expect(Math.abs(Fee.sellResult(100, be, 502.125, 0).profitBeforeTax)).toBeLessThan(1);
  });
});

describe("indicators", () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it("computes SMA", () => {
    expect(I.sma(v, 3).slice(0, 4)).toEqual([null, null, 2, 3]);
  });
  it("computes EMA seeded with the SMA", () => {
    const e = I.ema(v, 3);
    expect(e[2]).toBe(2);
    expect(e[3]).toBeCloseTo(3);
  });
  it("RSI is 100 for a pure uptrend and 0 for a downtrend", () => {
    expect(I.rsi(v, 5)[9]).toBe(100);
    expect(I.rsi([...v].reverse(), 5)[9]).toBe(0);
    expect(I.rsi([1, 2], 14)).toEqual([null, null]);
  });
  it("MACD of a constant series is zero", () => {
    const m = I.macd(Array(40).fill(100));
    expect(m.line[39]).toBeCloseTo(0);
    expect(m.hist[39]).toBeCloseTo(0);
  });
  it("Bollinger bands collapse on a flat series", () => {
    const b = I.bollinger(Array(25).fill(10), 20);
    expect(b.upper[24]).toBe(10);
    expect(b.lower[24]).toBe(10);
  });
  it("period return and high/low", () => {
    expect(I.periodReturn([100, 110, 121], 2)).toBeCloseTo(21);
    expect(I.periodReturn([100], 5)).toBeNull();
    expect(I.highLow([3, 9, 1])).toEqual({ high: 9, low: 1 });
  });
});

describe("accumulation", () => {
  const doc: Acc.AccumDoc = {
    s: "NABIL",
    dates: ["2026-10-07", "2026-10-08", "2026-10-09"],
    r: [
      [0, 58, 1000, 0, 500000, 0],
      [0, 34, 0, 1000, 0, 500000],
      [1, 58, 200, 100, 100000, 51000],
      [2, 34, 500, 0, 260000, 0],
      [2, 58, 0, 300, 0, 156000],
    ],
  };
  it("nets buys and sells per broker over all days", () => {
    const rows = Acc.netByBroker(doc, "ALL");
    const b58 = rows.find((r) => r.broker === 58)!;
    expect(b58.netQty).toBe(800);
    expect(b58.avgBuy).toBeCloseTo(600000 / 1200);
    expect(rows.find((r) => r.broker === 34)!.netQty).toBe(-500);
  });
  it("limits to the window's trading days", () => {
    const rows = Acc.netByBroker(doc, "1D");
    expect(rows.find((r) => r.broker === 58)!.netQty).toBe(-300);
    expect(rows.find((r) => r.broker === 34)!.netQty).toBe(500);
  });
  it("uses the market's dates so a stale stock shows nothing for 1D", () => {
    expect(Acc.netByBroker(doc, "1D", [...doc.dates, "2026-10-11"])).toEqual([]);
  });
  it("ranks accumulators and distributors", () => {
    const rows = Acc.netByBroker(doc, "ALL");
    expect(Acc.topAccumulators(rows).map((r) => r.broker)).toEqual([58]);
    expect(Acc.topDistributors(rows).map((r) => r.broker)).toEqual([34]);
  });
  it("builds a cumulative net series for the chart", () => {
    expect(Acc.cumulativeNet(doc, 58).map((p) => p.net)).toEqual([1000, 1100, 800]);
  });
  it("measures concentration", () => {
    const rows = Acc.netByBroker(doc, "ALL");
    expect(Acc.concentration(rows, 1)).toBeCloseTo((800 / 1700) * 100);
    expect(Acc.concentration([], 1)).toBe(0);
  });
});

describe("market clock", () => {
  const mon = (h: number, m: number) => new Date(Date.UTC(2026, 9, 12, h, m) - 345 * 60000); // NPT wall clock
  it("is pre-open before 11:00 NPT on a trading day", () => {
    const c = M.marketClock(mon(10, 30));
    expect(c.phase).toBe("pre");
    expect(c.next - mon(10, 30).getTime()).toBe(30 * 60000);
  });
  it("is open between 11:00 and 15:00 with a countdown to the close", () => {
    const c = M.marketClock(mon(14, 0));
    expect(c.phase).toBe("open");
    expect(c.nextKind).toBe("close");
  });
  it("after Friday's close the next open is Monday (or later with holidays)", () => {
    const fri = new Date(Date.UTC(2026, 9, 9, 16, 0) - 345 * 60000);
    const c = M.marketClock(fri);
    expect(c.phase).toBe("post");
    expect(new Date(c.next + 345 * 60000).toISOString().slice(0, 16)).toBe("2026-10-12T11:00");
  });
  it("skips holidays", () => {
    const c = M.marketClock(mon(9, 0), new Set(["2026-10-12"]));
    expect(c.phase).toBe("closed");
    expect(new Date(c.next + 345 * 60000).toISOString().slice(0, 10)).toBe("2026-10-13");
  });
  it("knows the weekly closures before and after the April 2026 switch", () => {
    expect(M.isTradingDay("2026-10-09", new Set())).toBe(true); // Friday
    expect(M.isTradingDay("2026-10-11", new Set())).toBe(false); // Sunday
    expect(M.isTradingDay("2026-10-10", new Set())).toBe(false); // Saturday
    expect(M.isTradingDay("2026-04-05", new Set())).toBe(true); // Sunday, old week
    expect(M.nptDateString(new Date("2026-10-10T18:30:00Z"))).toBe("2026-10-11");
  });
  it("formats countdowns", () => {
    expect(M.formatCountdown(9_030_000)).toBe("2h 30m");
    expect(M.formatCountdown(59_000)).toBe("59s");
    expect(M.formatCountdown(2 * 86400000 + 3600000)).toBe("2d 1h");
  });
});

describe("market data", () => {
  const latest: D.Latest = {
    v: 1, source: "x", fetchedAt: "t", status: { isOpen: "CLOSE", asOf: "2026-10-09T15:00:00" },
    summary: {}, indices: [], subindices: [], intraday: [],
    stocks: [
      ["AAA", 110, 10, 100, 100, 110, 99, 100, 11000, null],
      ["BBB", 90, -10, 100, 100, 101, 90, 50, 4500, null],
      ["CCC", 50, 0, 50, null, null, null, 0, null, null],
      ["DDD", 202, 1, 200, 200, 203, 199, 1000, 202000, null],
    ],
  };
  const secs: D.Security[] = [
    { s: "AAA", n: "Alpha Hydro", sec: "Hydro Power", id: 1 },
    { s: "BBB", n: "Beta Bank", sec: "Commercial Banks", id: 2 },
    { s: "DDD", n: "Delta Hydro", sec: "Hydro Power", id: 4 },
    { s: "AA", n: "Short", sec: "Others", id: 5 },
  ];
  const stocks = D.toStocks(latest, secs);
  it("joins sectors and derives change", () => {
    expect(stocks[0]).toMatchObject({ symbol: "AAA", sector: "Hydro Power", change: 10 });
    expect(stocks[2].turnover).toBe(0);
  });
  it("ranks gainers, losers and most active (traded only)", () => {
    expect(D.topGainers(stocks).map((s) => s.symbol)).toEqual(["AAA", "DDD"]);
    expect(D.topLosers(stocks).map((s) => s.symbol)).toEqual(["BBB"]);
    expect(D.mostActive(stocks)[0].symbol).toBe("DDD");
    expect(D.breadth(stocks)).toEqual({ up: 2, down: 1, flat: 0 });
  });
  it("builds a turnover-weighted sector heatmap", () => {
    const h = D.sectorHeatmap(stocks);
    expect(h[0].sector).toBe("Hydro Power");
    expect(h[0].pct).toBeCloseTo((10 * 11000 + 1 * 202000) / 213000, 2);
  });
  it("searches symbols before names", () => {
    expect(D.search(secs, "aa").map((s) => s.s)).toEqual(["AA", "AAA"]);
    expect(D.search(secs, "hydro").map((s) => s.s)).toEqual(["AAA", "DDD"]);
    expect(D.search(secs, " ")).toEqual([]);
  });
  it("validates the latest.json shape", () => {
    expect(D.isLatest(latest)).toBe(true);
    expect(D.isLatest({})).toBe(false);
  });
});

describe("alerts", () => {
  it("fires once on crossing and disarms", () => {
    const a = [Al.newAlert("nabil", "above", 540, "a1")];
    const q = new Map([["NABIL", { ltp: 541, pct: 1 }]]);
    const r1 = Al.evaluateAlerts(a, q, "t1");
    expect(r1.fired.map((x) => x.id)).toEqual(["a1"]);
    expect(Al.evaluateAlerts(r1.next, q, "t2").fired).toEqual([]);
  });
  it("supports below and percent conditions", () => {
    const q = { ltp: 90, pct: -4 };
    expect(Al.conditionMet(Al.newAlert("X", "below", 95), q)).toBe(true);
    expect(Al.conditionMet(Al.newAlert("X", "pctDown", 3), q)).toBe(true);
    expect(Al.conditionMet(Al.newAlert("X", "pctUp", 3), q)).toBe(false);
  });
  it("ignores symbols without quotes", () => {
    expect(Al.evaluateAlerts([Al.newAlert("ZZZ", "above", 1)], new Map(), "t").fired).toEqual([]);
  });
  it("validates input", () => {
    expect(Al.validateAlert("above", -1)).toMatch(/positive/);
    expect(Al.validateAlert("pctUp", 12)).toMatch(/10%/);
    expect(Al.validateAlert("below", 100)).toBeNull();
    expect(Al.describeAlert(Al.newAlert("X", "pctDown", 3))).toContain("down 3%");
  });
});

describe("portfolio", () => {
  const txns: P.Txn[] = [
    { id: "1", symbol: "NABIL", side: "buy", qty: 100, price: 500, date: "2026-01-01" },
    { id: "2", symbol: "NABIL", side: "buy", qty: 100, price: 600, date: "2026-02-01" },
    { id: "3", symbol: "NABIL", side: "bonus", qty: 20, price: 0, date: "2026-03-01" },
  ];
  it("computes WACC including fees and bonus shares", () => {
    const [h] = P.holdings(txns);
    const invested = Fee.buyCost(100, 500).total + Fee.buyCost(100, 600).total;
    expect(h.qty).toBe(220);
    expect(h.wacc).toBeCloseTo(invested / 220);
  });
  it("realizes P/L on sells and keeps WACC", () => {
    const [h] = P.holdings([...txns, { id: "4", symbol: "NABIL", side: "sell", qty: 120, price: 700, date: "2026-04-01" }]);
    expect(h.qty).toBe(100);
    expect(h.realized).toBeGreaterThan(0);
    const [h0] = P.holdings(txns);
    expect(h.wacc).toBeCloseTo(h0.wacc);
  });
  it("clamps oversells and resets when fully sold", () => {
    const [h] = P.holdings([txns[0], { id: "5", symbol: "NABIL", side: "sell", qty: 500, price: 400, date: "2026-02-01" }]);
    expect(h.qty).toBe(0);
    expect(h.realized).toBeLessThan(0);
    expect(h.wacc).toBe(0);
  });
  it("values holdings at LTP after sell costs and tax", () => {
    const hs = P.holdings(txns.slice(0, 1));
    const v = P.valueHoldings(hs, new Map([["NABIL", { ltp: 600, change: 5 }]]), "2026-06-01");
    expect(v[0].value).toBe(60000);
    expect(v[0].dayChange).toBe(500);
    expect(v[0].unrealized).toBe(Fee.sellResult(100, 600, hs[0].wacc, 151).netProfit);
    expect(P.totals(v).unrealizedPct).toBeCloseTo((v[0].unrealized / hs[0].invested) * 100);
  });
  it("counts days between dates", () => {
    expect(P.daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });
});

describe("toCandles", () => {
  it("maps OHLC and direction", () => {
    const c = toCandles([["2026-10-01", 100, 110, 95, 105, 50, 0], ["2026-10-02", 105, 106, 90, 92, 70, 0]]);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ open: 100, high: 110, low: 95, close: 105, volume: 50, up: true });
    expect(c[1].up).toBe(false);
  });
  it("handles a single row and empty input", () => {
    expect(toCandles([])).toEqual([]);
    expect(toCandles([["2026-10-01", 10, 12, 9, 11, 1, 0]])).toHaveLength(1);
  });
  it("treats a flat day as up with equal OHLC", () => {
    const [c] = toCandles([["2026-10-01", 50, 50, 50, 50, 0, 0]]);
    expect([c.open, c.high, c.low, c.close, c.up]).toEqual([50, 50, 50, 50, true]);
  });
  it("handles gaps: bad open uses previous close, bad rows dropped, order and dupes fixed", () => {
    const c = toCandles([
      ["2026-10-05", 0, 0, 0, 120, 5, 0],
      ["2026-10-01", 100, 105, 99, 101, 5, 0],
      ["2026-10-03", 101, 101, 101, 0, 0, 0],
      ["2026-10-05", 0, 0, 0, 121, 6, 0],
    ]);
    expect(c.map((x) => x.date)).toEqual(["2026-10-01", "2026-10-05"]);
    expect(c[1]).toMatchObject({ open: 101, high: 121, low: 101, close: 121 });
  });
});
