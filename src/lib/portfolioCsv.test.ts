import { describe, expect, it } from "vitest";
import { dedupe, parseCsv, toCsv, toJson } from "./portfolioCsv";
import type { Txn } from "./portfolio";

const known = new Set(["NABIL", "NICA"]);
const t = (o: Partial<Txn> = {}): Txn => ({ id: "a", symbol: "NABIL", side: "buy", qty: 10, price: 500, date: "2024-01-02", ...o });

describe("portfolioCsv", () => {
  it("round-trips through toCsv and parseCsv", () => {
    const r = parseCsv(toCsv([t(), t({ id: "b", side: "bonus", price: 0, qty: 2 })]), known);
    expect(r.errors).toEqual([]);
    expect(r.txns.map((x) => ({ symbol: x.symbol, side: x.side, qty: x.qty, price: x.price, date: x.date }))).toEqual([
      { symbol: "NABIL", side: "buy", qty: 10, price: 500, date: "2024-01-02" },
      { symbol: "NABIL", side: "bonus", qty: 2, price: 0, date: "2024-01-02" },
    ]);
  });
  it("handles BOM, CRLF, quotes and thousands separators", () => {
    const r = parseCsv('﻿Symbol,Side,Qty,Price,Date\r\n"nabil","Buy","1,000","1,250.50",2024-02-03\r\n', known);
    expect(r.errors).toEqual([]);
    expect(r.txns[0]).toMatchObject({ symbol: "NABIL", side: "buy", qty: 1000, price: 1250.5 });
  });
  it("lists errors per line and keeps good rows", () => {
    const r = parseCsv(
      ["Symbol,Side,Qty,Price,Date", "NABIL,buy,10,500,2024-01-02", "ZZZZ,buy,10,500,2024-01-02", "NICA,hold,10,500,2024-01-02",
        "NICA,buy,1.5,500,2024-01-02", "NICA,buy,5,-1,2024-01-02", "NICA,buy,5,500,2024-13-45", "NICA,buy"].join("\n"),
      known,
    );
    expect(r.txns).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(r.errors[0].message).toMatch(/symbol/i);
  });
  it("accepts bonus rows without a price", () => {
    const r = parseCsv("Symbol,Side,Qty,Price,Date\nNICA,bonus,3,,2024-01-02", known);
    expect(r.errors).toEqual([]);
    expect(r.txns[0]).toMatchObject({ side: "bonus", price: 0 });
  });
  it("rejects a missing header", () => {
    expect(parseCsv("foo,bar\n1,2", known).errors[0].line).toBe(1);
  });
  it("escapes quotes on export", () => {
    expect(toCsv([t({ symbol: 'A"B' })])).toContain('"A""B"');
  });
  it("exports JSON", () => {
    expect(JSON.parse(toJson([t()]))).toHaveLength(1);
  });
  it("drops duplicates against existing and within the import", () => {
    const incoming = [t({ id: "x" }), t({ id: "y", qty: 11 }), t({ id: "z", qty: 11 })];
    const r = dedupe([t()], incoming);
    expect(r.added.map((x) => x.id)).toEqual(["y"]);
    expect(r.duplicates).toBe(2);
  });
});
