import { useCallback, useEffect, useMemo, useState } from "react";
import { loadData, loadLatest, sources, type Mode } from "./lib/api";
import { isLatest, toStocks, type Latest, type Security, type Stock } from "./lib/data";
import { marketClock } from "./lib/market";

export interface Manifest {
  floorsheetDays?: string[];
  firstFloorsheetDay?: string;
  latestBusinessDay?: string;
  sample?: boolean;
}

export interface Issue {
  type: string;
  symbol: string;
  company: string;
  units: number;
  price: number;
  open: string | null;
  close: string | null;
  status: "open" | "upcoming" | "closed" | "unknown";
  manager: string | null;
}

export interface MarketData {
  mode: Mode;
  latest: Latest;
  stocks: Stock[];
  securities: Security[];
  brokers: Record<string, string>;
  holidays: Set<string>;
  manifest: Manifest;
  indexHistory: [string, number, number, number, number, number][];
  issues: Issue[];
}

export const SRC = sources(import.meta.env.VITE_API_URL as string | undefined, import.meta.env.BASE_URL ?? "./");

export function useMarket() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(false);
      const { mode, latest } = await loadLatest(SRC, isLatest);
      const [securities, brokers, holidays, manifest, index, issues] = await Promise.all([
        loadData<Security[]>(SRC, mode, "meta/securities.json"),
        loadData<Record<string, string>>(SRC, mode, "meta/brokers.json"),
        loadData<Record<string, string[]>>(SRC, mode, "meta/holidays.json"),
        loadData<Manifest>(SRC, mode, "manifest.json"),
        loadData<MarketData["indexHistory"]>(SRC, mode, "index/nepse.json"),
        loadData<{ items: Issue[] }>(SRC, mode, "issues.json"),
      ]);
      const secs = securities ?? [];
      setData({
        mode,
        latest,
        stocks: toStocks(latest, secs),
        securities: secs,
        brokers: brokers ?? {},
        holidays: new Set(Object.values(holidays ?? {}).flat()),
        manifest: manifest ?? {},
        indexHistory: index ?? [],
        issues: issues?.items ?? [],
      });
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // Refresh every 2 minutes while the market is open (the collector publishes every ~10 minutes).
  const open = data ? marketClock(new Date(), data.holidays).phase === "open" : false;
  useEffect(() => {
    if (!open || data?.mode !== "live") return;
    const id = setInterval(() => setTick((x) => x + 1), 120_000);
    return () => clearInterval(id);
  }, [open, data?.mode]);

  const reload = useCallback(() => setTick((x) => x + 1), []);
  return useMemo(() => ({ data, error, reload }), [data, error, reload]);
}
