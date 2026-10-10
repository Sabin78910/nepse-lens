import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMarket } from "./useMarket";
import { Ctx, makeTr, useApp, type AppState } from "./components/ui";
import { KEYS, load, save, toggle } from "./lib/storage";
import { evaluateAlerts, describeAlert, type Alert } from "./lib/alerts";
import type { Txn } from "./lib/portfolio";
import { formatCountdown, marketClock } from "./lib/market";
import { ageLabel, type Lang } from "./lib/format";
import { search } from "./lib/data";
import { notify } from "./lib/notify";
import { useInstallPrompt } from "./install";
import Market from "./pages/Market";
import Stock from "./pages/Stock";
import Brokers from "./pages/Brokers";
import Watchlist from "./pages/Watchlist";
import Portfolio from "./pages/Portfolio";
import More from "./pages/More";

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || "#/market");
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || "#/market");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((h: string) => {
    window.location.hash = h;
  }, []);
  return { hash, go };
}

const TABS = [
  { hash: "#/market", key: "market", icon: "M3 17l5-5 4 4 8-8M15 8h5v5" },
  { hash: "#/watch", key: "watchlist", icon: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" },
  { hash: "#/brokers", key: "brokers", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { hash: "#/portfolio", key: "portfolio", icon: "M3 7h18v13H3zM8 7V4h8v3" },
  { hash: "#/more", key: "more", icon: "M5 12h.01M12 12h.01M19 12h.01" },
] as const;

export default function App() {
  const { data, error, reload } = useMarket();
  const { hash, go } = useHash();
  const [lang, setLangState] = useState<Lang>(() => load<Lang>(KEYS.lang, "en"));
  const [theme, setThemeState] = useState<"dark" | "light">(() => load(KEYS.theme, "dark"));
  const [watchlist, setWatchlist] = useState<string[]>(() => load(KEYS.watchlist, ["NABIL", "NICA", "HDL", "UPPER"]));
  const [alerts, setAlertsState] = useState<Alert[]>(() => load(KEYS.alerts, [] as Alert[]));
  const [txns, setTxnsState] = useState<Txn[]>(() => load(KEYS.txns, [] as Txn[]));
  const { canInstall, install } = useInstallPrompt();
  const tr = useMemo(() => makeTr(lang), [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  const setLang = (l: Lang) => (setLangState(l), save(KEYS.lang, l));
  const setTheme = (t: "dark" | "light") => (setThemeState(t), save(KEYS.theme, t));
  const setAlerts = useCallback((a: Alert[]) => (setAlertsState(a), save(KEYS.alerts, a)), []);
  const setTxns = (t: Txn[]) => (setTxnsState(t), save(KEYS.txns, t));
  const toggleWatch = (s: string) =>
    setWatchlist((w) => {
      const n = toggle(w, s);
      save(KEYS.watchlist, n);
      return n;
    });

  // Evaluate alerts whenever fresh live data arrives (never against the recorded sample).
  const lastFetched = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.mode !== "live" || lastFetched.current === data.latest.fetchedAt) return;
    lastFetched.current = data.latest.fetchedAt;
    const quotes = new Map(data.stocks.map((s) => [s.symbol, { ltp: s.ltp, pct: s.pct }]));
    const { fired, next } = evaluateAlerts(alerts, quotes, new Date().toISOString());
    if (fired.length) {
      setAlerts(next);
      fired.forEach((a) => void notify("NEPSE Lens alert", describeAlert(a)));
    }
  }, [data, alerts, setAlerts]);

  if (!data) {
    return (
      <div className="boot" role="status">
        <Logo />
        <p>{error ? tr("error") : tr("loading")}</p>
        {error && <button className="primary" onClick={reload}>{tr("retry")}</button>}
      </div>
    );
  }

  const state: AppState = { data, lang, tr, go, watchlist, toggleWatch, alerts, setAlerts, txns, setTxns };
  const [, route, param] = hash.split("/");
  let page;
  switch (route) {
    case "stock":
      page = <Stock symbol={decodeURIComponent(param ?? "")} key={param} />;
      break;
    case "watch":
      page = <Watchlist />;
      break;
    case "brokers":
      page = <Brokers broker={param} />;
      break;
    case "portfolio":
      page = <Portfolio />;
      break;
    case "more":
      page = <More lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} canInstall={canInstall} install={install} />;
      break;
    default:
      page = <Market />;
  }

  return (
    <Ctx.Provider value={state}>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      {data.mode === "sample" && (
        <div className="banner sample" role="note">
          <strong>SAMPLE</strong> {tr("sampleBanner", { date: data.latest.status.asOf.slice(0, 10) })}
        </div>
      )}
      <main id="main">{page}</main>
      <footer className="disclaimer">{tr("disclaimer")}</footer>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tb) => {
          const active = hash.startsWith(tb.hash) || (tb.hash === "#/market" && route === "stock");
          return (
            <a key={tb.hash} href={tb.hash} className={active ? "on" : ""} aria-current={active ? "page" : undefined}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={tb.icon} /></svg>
              <span>{tr(tb.key)}</span>
            </a>
          );
        })}
      </nav>
    </Ctx.Provider>
  );
}

function Header() {
  const { data, lang, tr, go } = useApp();
  const [now, setNow] = useState(() => new Date());
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = marketClock(now, data.holidays);
  const results = search(data.securities, q, 8);
  const label = clock.phase === "open" ? tr("open") : clock.phase === "pre" ? tr("preOpen") : tr("closed");
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span>{tr("appName")}</span>
      </div>
      <div className={`status ${clock.phase}`} aria-live="polite">
        <span className="pulse" aria-hidden="true" />
        <span>{label}</span>
        <span className="muted tabular">· {tr(clock.nextKind === "open" ? "opensIn" : "closesIn")} {formatCountdown(clock.next - now.getTime())}</span>
      </div>
      <div className="searchbox">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("search")}
          aria-label={tr("search")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              go(`#/stock/${results[0].s}`);
              setQ("");
            }
          }}
        />
        {q && (
          <ul className="results" role="listbox">
            {results.length === 0 && <li className="muted">{tr("noResults")}</li>}
            {results.map((r) => (
              <li key={r.s}>
                <button onClick={() => { go(`#/stock/${r.s}`); setQ(""); }}>
                  <strong>{r.s}</strong> <small className="muted">{r.n}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="updated muted tabular">
        {tr("updated")}: {data.mode === "sample" ? data.latest.status.asOf.replace("T", " ").slice(0, 16) : ageLabel(data.latest.fetchedAt, now, lang)}
      </p>
    </header>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0F1626" />
      <circle cx="28" cy="28" r="15" fill="none" stroke="#22D3EE" strokeWidth="5" />
      <path d="M39 39l12 12" stroke="#22D3EE" strokeWidth="6" strokeLinecap="round" />
      <path d="M19 33l6-7 5 4 7-9" fill="none" stroke="#22C55E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
