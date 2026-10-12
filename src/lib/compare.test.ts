import { describe, expect, it } from "vitest";
import { MAX_COMPARE, compareHash, normalise, parseCompare, toggleSymbol, topAccumulation, weekRange } from "./compare";
import type { PriceRow } from "./data";
import type { AccumDoc } from "./accumulation";

const row = (d: string, c: number): PriceRow => [d, c, c, c, c, 1, 1];

describe("compare url", () => {
  it("parses symbols and start date, dedupes, caps at four", () => {
    expect(parseCompare("#/compare/nabil,NICA,nabil?from=2026-01-05")).toEqual({ symbols: ["NABIL", "NICA"], from: "2026-01-05" });
    expect(parseCompare("#/compare/A,B,C,D,E").symbols).toHaveLength(MAX_COMPARE);
    expect(parseCompare("#/compare")).toEqual({ symbols: [], from: null });
    expect(parseCompare("#/compare/A?from=bad").from).toBeNull();
  });
  it("round-trips through compareHash", () => {
    const h = compareHash(["NABIL", "NICA"], "2026-01-05");
    expect(h).toBe("#/compare/NABIL,NICA?from=2026-01-05");
    expect(parseCompare(h)).toEqual({ symbols: ["NABIL", "NICA"], from: "2026-01-05" });
    expect(compareHash(["A"], null)).toBe("#/compare/A");
  });
  it("toggles symbols and refuses a fifth", () => {
    expect(toggleSymbol(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleSymbol(["A", "B"], "A")).toEqual(["B"]);
    expect(toggleSymbol(["A", "B", "C", "D"], "E")).toEqual(["A", "B", "C", "D"]);
  });
});

describe("normalise", () => {
  const a = [row("2026-01-01", 100), row("2026-01-02", 110), row("2026-01-03", 121)];
  const b = [row("2026-01-02", 50), row("2026-01-03", 45)];
  it("starts every line at 0% on the first date all symbols share", () => {
    const n = normalise({ A: a, B: b });
    expect(n.start).toBe("2026-01-02");
    expect(n.dates).toEqual(["2026-01-02", "2026-01-03"]);
    expect(n.lines.A).toEqual([0, 10]);
    expect(n.lines.B).toEqual([0, -10]);
  });
  it("honours a later requested start date", () => {
    const n = normalise({ A: a, B: b }, "2026-01-03");
    expect(n.start).toBe("2026-01-03");
    expect(n.lines.A).toEqual([0]);
  });
  it("returns empty when there is no overlap", () => {
    expect(normalise({ A: a, B: [row("2025-01-01", 5)] }).dates).toEqual([]);
    expect(normalise({}).start).toBeNull();
  });
});

describe("stats", () => {
  it("computes the 52-week range from the last 260 closes", () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(`d${i}`, i + 1));
    expect(weekRange(rows)).toEqual({ low: 41, high: 300 });
    expect(weekRange([])).toBeNull();
  });
  it("sums the top accumulators' net quantity", () => {
    const doc: AccumDoc = { s: "X", dates: ["d1"], r: [[0, 1, 100, 0, 0, 0], [0, 2, 0, 40, 0, 0], [0, 3, 30, 0, 0, 0]] };
    expect(topAccumulation(doc, ["d1"], 5)).toBe(130);
    expect(topAccumulation(doc, ["d1"], 1)).toBe(100);
    expect(topAccumulation(null, [], 5)).toBeNull();
  });
});
