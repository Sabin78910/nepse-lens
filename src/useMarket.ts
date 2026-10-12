import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadData, loadLatest, sources, type Mode } from "./lib/api";
import { isLatest, toStocks, type Latest, type Security, type Stock } from "./lib/data";
import { marketClock } from "./lib/market";
import { POLL_MS, diffTicks, shouldPoll, type Tick } from "./lib/pulse";

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
  /** Symbols whose price changed in the latest refresh, and a counter that bumps on each refresh. */
  ticks: Record<string, Tick>;
  tickId: number;
}

export const SRC = sources(import.meta.env.VITE_API_URL as string | undefined, import.meta.env.BASE_URL ?? "./");

export function useMarket() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const prevStocks = useRef<Stock[]>([]);
  const tickId = useRef(0);

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
      const ticks = diffTicks(prevStocks.current, toStocks(latest, secs));
      prevStocks.current = toStocks(latest, secs);
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
        ticks,
        tickId: ++tickId.current,
      });
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // Poll every 30s while the market is open, the tab is visible and the device is online.
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const vis = () => setVisible(document.visibilityState !== "hidden");
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const phase = data ? marketClock(new Date(), data.holidays).phase : "closed";
  const mode = data?.mode ?? "sample";
  const polling = shouldPoll({ phase, visible, online, mode });
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => setTick((x) => x + 1), POLL_MS);
    return () => clearInterval(id);
  }, [polling]);

  const reload = useCallback(() => setTick((x) => x + 1), []);
  return useMemo(() => ({ data, error, reload }), [data, error, reload]);
}
