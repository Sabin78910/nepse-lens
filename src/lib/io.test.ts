import { describe, expect, it } from "vitest";
import { loadData, loadLatest, sources } from "./api";
import { load, save, toggle } from "./storage";
import { STRINGS, t, sectorName } from "./i18n";
import { isLatest } from "./data";

const LATEST = { v: 1, stocks: [], indices: [], status: { isOpen: "CLOSE", asOf: "x" } };

function fakeFetch(map: Record<string, unknown>) {
  return async (url: string) => {
    const key = Object.keys(map).find((k) => url.startsWith(k));
    return key ? new Response(JSON.stringify(map[key]), { status: 200 }) : new Response("no", { status: 404 });
  };
}

describe("api", () => {
  it("uses the static GitHub data by default and the Worker when configured", () => {
    expect(sources(undefined).latest).toContain("/live/latest.json");
    expect(sources(undefined).data("accum/NABIL.json")).toContain("/data/accum/NABIL.json");
    const w = sources("https://w.example.dev/");
    expect(w.latest).toBe("https://w.example.dev/latest.json");
    expect(w.data("x.json")).toBe("https://w.example.dev/data/x.json");
  });
  it("reads live data when published", async () => {
    const src = sources(undefined, "/");
    const r = await loadLatest(src, isLatest, fakeFetch({ [src.latest]: LATEST }));
    expect(r.mode).toBe("live");
  });
  it("falls back to the bundled sample when live data is missing", async () => {
    const src = sources(undefined, "/");
    const r = await loadLatest(src, isLatest, fakeFetch({ "/sample/latest.json": LATEST }));
    expect(r.mode).toBe("sample");
  });
  it("rejects invalid live data", async () => {
    const src = sources(undefined, "/");
    const r = await loadLatest(src, isLatest, fakeFetch({ [src.latest]: { bad: 1 }, "/sample/latest.json": LATEST }));
    expect(r.mode).toBe("sample");
  });
  it("history follows the mode and missing files are null", async () => {
    const src = sources(undefined, "/");
    const f = fakeFetch({ "/sample/accum/NABIL.json": { s: "NABIL" } });
    expect(await loadData(src, "sample", "accum/NABIL.json", f)).toEqual({ s: "NABIL" });
    expect(await loadData(src, "live", "accum/NABIL.json", f)).toBeNull();
  });
});

describe("storage", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("round-trips values", () => {
    const s = mem();
    save("k", ["A"], s);
    expect(load("k", [] as string[], s)).toEqual(["A"]);
  });
  it("falls back on corrupt or mismatched data", () => {
    const s = mem();
    s.setItem("k", "{bad");
    expect(load("k", [1], s)).toEqual([1]);
    s.setItem("k", '{"a":1}');
    expect(load("k", [1], s)).toEqual([1]);
  });
  it("toggles watchlist items", () => {
    expect(toggle(["A"], "B")).toEqual(["A", "B"]);
    expect(toggle(["A", "B"], "A")).toEqual(["B"]);
  });
});

describe("i18n", () => {
  it("has every English key in Nepali", () => {
    expect(Object.keys(STRINGS.ne).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });
  it("fills variables", () => {
    expect(t("en", "sampleBanner", { date: "9 Oct" })).toContain("9 Oct");
  });
  it("translates sectors with a fallback", () => {
    expect(sectorName("ne", "Hydro Power")).toBe("जलविद्युत");
    expect(sectorName("ne", "New Sector")).toBe("New Sector");
    expect(sectorName("en", "Hydro Power")).toBe("Hydro Power");
  });
});
