import { describe, expect, it } from "vitest";
import { emptyDoc, materialize, mergeDocs, reconcile, type SyncDoc } from "./syncMerge";
import type { Alert } from "./alerts";

const lists = (d: SyncDoc) => materialize(d);
const alert = (id: string, value = 100): Alert => ({ id, symbol: "NABIL", kind: "above", value, active: true });

describe("reconcile", () => {
  it("stamps new items, tombstones removed ones and leaves unchanged ones alone", () => {
    let d = reconcile(emptyDoc(), { watchlist: ["A", "B"], alerts: [alert("1")], txns: [] }, 10);
    expect(d.watch.A.at).toBe(10);
    d = reconcile(d, { watchlist: ["A"], alerts: [alert("1", 120)], txns: [] }, 20);
    expect(d.watch.A.at).toBe(10);
    expect(d.watch.B).toEqual({ at: 20, del: true });
    expect(d.alerts["1"].at).toBe(20);
    expect(lists(d).watchlist).toEqual(["A"]);
  });
  it("returns the same object when nothing changed", () => {
    const d = reconcile(emptyDoc(), { watchlist: ["A"], alerts: [], txns: [] }, 10);
    expect(reconcile(d, { watchlist: ["A"], alerts: [], txns: [] }, 99)).toBe(d);
  });
  it("revives a tombstoned item that is added again", () => {
    let d = reconcile(emptyDoc(), { watchlist: ["A"], alerts: [], txns: [] }, 1);
    d = reconcile(d, { watchlist: [], alerts: [], txns: [] }, 2);
    d = reconcile(d, { watchlist: ["A"], alerts: [], txns: [] }, 3);
    expect(lists(d).watchlist).toEqual(["A"]);
  });
});

describe("mergeDocs", () => {
  it("unions the watchlist across devices", () => {
    const a = reconcile(emptyDoc(), { watchlist: ["A"], alerts: [], txns: [] }, 1);
    const b = reconcile(emptyDoc(), { watchlist: ["B"], alerts: [], txns: [] }, 2);
    expect(lists(mergeDocs(a, b)).watchlist.sort()).toEqual(["A", "B"]);
  });
  it("keeps the newest version of an item", () => {
    const a = reconcile(emptyDoc(), { watchlist: [], alerts: [alert("1", 100)], txns: [] }, 1);
    const b = reconcile(emptyDoc(), { watchlist: [], alerts: [alert("1", 200)], txns: [] }, 5);
    expect(lists(mergeDocs(a, b)).alerts[0].value).toBe(200);
    expect(lists(mergeDocs(b, a)).alerts[0].value).toBe(200);
  });
  it("a newer deletion beats an older edit, and a newer edit beats an older deletion", () => {
    const base = reconcile(emptyDoc(), { watchlist: ["A"], alerts: [], txns: [] }, 1);
    const deleted = reconcile(base, { watchlist: [], alerts: [], txns: [] }, 5);
    expect(lists(mergeDocs(base, deleted)).watchlist).toEqual([]);
    const readded = reconcile(deleted, { watchlist: ["A"], alerts: [], txns: [] }, 9);
    expect(lists(mergeDocs(deleted, readded)).watchlist).toEqual(["A"]);
  });
  it("is commutative on ties, preferring the deletion", () => {
    const a: SyncDoc = { ...emptyDoc(), watch: { A: { at: 5, v: true } } };
    const b: SyncDoc = { ...emptyDoc(), watch: { A: { at: 5, del: true } } };
    expect(mergeDocs(a, b)).toEqual(mergeDocs(b, a));
    expect(lists(mergeDocs(a, b)).watchlist).toEqual([]);
  });
  it("tolerates a malformed remote document", () => {
    const a = reconcile(emptyDoc(), { watchlist: ["A"], alerts: [], txns: [] }, 1);
    expect(lists(mergeDocs(a, {} as SyncDoc)).watchlist).toEqual(["A"]);
  });
});
