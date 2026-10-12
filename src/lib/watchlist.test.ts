import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastCloses, loadSparkline, moveItem, resetSparkCache, sortStocks, SPARK_DAYS } from "./watchlist";
import type { Stock } from "./data";
import { sources } from "./api";

const mk = (symbol: string, pct: number, turnover: number): Stock => ({
  symbol, name: symbol, sector: "Others", ltp: 100, pct, change: 0, prevClose: 100, open: null, high: null, low: null, qty: 1, turnover,
});
const A = mk("AAA", -1, 300);
const B = mk("BBB", 2, 100);
const C = mk("CCC", 0.5, 200);

describe("sortStocks", () => {
  it("keeps the user's order for manual", () => {
    expect(sortStocks([C, A, B], "manual").map((s) => s.symbol)).toEqual(["CCC", "AAA", "BBB"]);
  });
  it("sorts by change descending", () => {
    expect(sortStocks([A, B, C], "change").map((s) => s.symbol)).toEqual(["BBB", "CCC", "AAA"]);
  });
  it("sorts by turnover descending", () => {
    expect(sortStocks([B, C, A], "turnover").map((s) => s.symbol)).toEqual(["AAA", "CCC", "BBB"]);
  });
  it("sorts A-Z and does not mutate the input", () => {
    const input = [C, A, B];
    expect(sortStocks(input, "name").map((s) => s.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(input.map((s) => s.symbol)).toEqual(["CCC", "AAA", "BBB"]);
  });
});

describe("moveItem", () => {
  it("moves up and down", () => {
    expect(moveItem(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("is a no-op at the edges or for unknown items", () => {
    expect(moveItem(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
});

describe("lastCloses", () => {
  it("takes the last 30 closes", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ["d", 0, 0, 0, i, 0, 0]) as never;
    const c = lastCloses(rows);
    expect(c).toHaveLength(SPARK_DAYS);
    expect(c[0]).toBe(10);
    expect(c[29]).toBe(39);
  });
});

describe("loadSparkline", () => {
  beforeEach(resetSparkCache);
  const src = sources(undefined, "/");
  it("fetches once per symbol per session", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ d: [["d", 1, 1, 1, 5, 1, 1], ["d", 1, 1, 1, 6, 1, 1]] }), { status: 200 }));
    expect(await loadSparkline(src, "sample", "NABIL", f)).toEqual([5, 6]);
    expect(await loadSparkline(src, "sample", "NABIL", f)).toEqual([5, 6]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("resolves to an empty list when the file is missing", async () => {
    const f = async () => new Response("no", { status: 404 });
    expect(await loadSparkline(src, "sample", "ZZZ", f)).toEqual([]);
  });
});
