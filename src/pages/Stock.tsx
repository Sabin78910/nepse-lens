import { useEffect, useMemo, useState } from "react";
import { Card, Change, Segmented, useApp } from "../components/ui";
import { NetBars, PriceChart } from "../components/Charts";
import { loadData } from "../lib/api";
import { SRC } from "../useMarket";
import type { PriceRow } from "../lib/data";
import { netByBroker, topAccumulators, topDistributors, concentration, type AccumDoc, type Window } from "../lib/accumulation";
import { formatCompact, formatPrice, formatQty } from "../lib/format";
import { highLow, periodReturn, rsi } from "../lib/indicators";
import { newAlert, validateAlert, describeAlert, type AlertKind } from "../lib/alerts";
import { requestPermission } from "../lib/notify";
import { sectorName } from "../lib/i18n";

const RANGES = { "1M": 22, "3M": 66, "6M": 130, "1Y": 260 } as const;
type Range = keyof typeof RANGES;

export default function Stock({ symbol }: { symbol: string }) {
  const { data, lang, tr, go, watchlist, toggleWatch, alerts, setAlerts } = useApp();
  const stock = data.stocks.find((s) => s.symbol === symbol);
  const meta = data.securities.find((s) => s.s === symbol);
  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [accum, setAccum] = useState<AccumDoc | null>(null);
  const [range, setRange] = useState<Range>("3M");
  const [win, setWin] = useState<Window>("1M");
  const [kind, setKind] = useState<AlertKind>("above");
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPrices(null);
    setAccum(null);
    void loadData<{ d: PriceRow[] }>(SRC, data.mode, `prices/${symbol}.json`).then((d) => live && setPrices(d?.d ?? []));
    void loadData<AccumDoc>(SRC, data.mode, `accum/${symbol}.json`).then((d) => live && setAccum(d ?? { s: symbol, dates: [], r: [] }));
    return () => {
      live = false;
    };
  }, [symbol, data.mode]);

  const closes = useMemo(() => (prices ?? []).map((p) => p[4]), [prices]);
  const bars = useMemo(() => (prices ?? []).slice(-RANGES[range]).map((p) => ({ date: p[0], close: p[4], volume: p[5] })), [prices, range]);
  const marketDays = data.manifest.floorsheetDays;
  const rows = useMemo(() => (accum ? netByBroker(accum, win, marketDays) : []), [accum, win, marketDays]);
  const acc = topAccumulators(rows, 8);
  const dist = topDistributors(rows, 8);
  const hl = highLow(closes.slice(-260));
  const r14 = rsi(closes, 14).at(-1);
  const name = (b: number) => data.brokers[String(b)] ?? `Broker ${b}`;
  const watched = watchlist.includes(symbol);
  const myAlerts = alerts.filter((a) => a.symbol === symbol);
  const since = data.manifest.firstFloorsheetDay ?? "—";

  const addAlert = async () => {
    const v = Number(val);
    const e = validateAlert(kind, v);
    setErr(e);
    if (e) return;
    await requestPermission();
    setAlerts([...alerts, newAlert(symbol, kind, v)]);
    setVal("");
  };

  return (
    <div className="page">
      <div className="stock-head">
        <button className="ghost back" onClick={() => go("#/market")} aria-label={tr("back")}>←</button>
        <div className="stock-title">
          <h1>{symbol}</h1>
          <p className="muted">{meta?.n ?? stock?.name} · {sectorName(lang, meta?.sec ?? stock?.sector ?? "")}</p>
        </div>
        <button className="ghost" onClick={() => go(`#/compare/${symbol}`)}>{tr("compare")}</button>
        <button className={`star ${watched ? "on" : ""}`} onClick={() => toggleWatch(symbol)} aria-pressed={watched} aria-label={tr(watched ? "removeWatch" : "addWatch")}>
          {watched ? "★" : "☆"}
        </button>
      </div>

      <Card>
        <div className="quote">
          <span className="hero-value tabular">{formatPrice(stock?.ltp ?? closes.at(-1), lang)}</span>
          {stock && <Change pct={stock.pct} change={stock.change} lang={lang} big />}
        </div>
        <Segmented label="Range" value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: r }))} />
        {prices == null ? <div className="skeleton chart-skel" /> : <PriceChart bars={bars} lang={lang} />}
        <dl className="stats">
          <div><dt>{tr("prevClose")}</dt><dd className="tabular">{formatPrice(stock?.prevClose, lang)}</dd></div>
          <div><dt>{tr("high")} / {tr("low")}</dt><dd className="tabular">{formatPrice(stock?.high, lang)} / {formatPrice(stock?.low, lang)}</dd></div>
          <div><dt>{tr("volume")}</dt><dd className="tabular">{formatQty(stock?.qty, lang)}</dd></div>
          <div><dt>{tr("turnover")}</dt><dd className="tabular">{formatCompact(stock?.turnover, lang)}</dd></div>
          <div><dt>{tr("week52")}</dt><dd className="tabular">{hl ? `${formatPrice(hl.low, lang)} – ${formatPrice(hl.high, lang)}` : "—"}</dd></div>
          <div><dt>RSI 14</dt><dd className="tabular">{r14 != null ? r14.toFixed(1) : "—"}</dd></div>
          <div><dt>1M</dt><dd className="tabular">{fmtRet(periodReturn(closes, 22))}</dd></div>
          <div><dt>3M</dt><dd className="tabular">{fmtRet(periodReturn(closes, 66))}</dd></div>
        </dl>
      </Card>

      <Card
        title={tr("accumulation")}
        actions={<Segmented label="Window" value={win} onChange={setWin} options={(["1D", "1W", "1M", "3M", "ALL"] as Window[]).map((w) => ({ value: w, label: w === "ALL" ? "All" : w }))} />}
      >
        <p className="definition">ⓘ {tr("accumDefinition", { date: since })}</p>
        {accum == null ? (
          <div className="skeleton" />
        ) : rows.length === 0 ? (
          <p className="muted">{tr("noFloorsheet")}</p>
        ) : (
          <>
            <NetBars rows={[...acc.slice(0, 5), ...dist.slice(0, 5).reverse()]} name={name} lang={lang} />
            <p className="muted small">Top-5 accumulators hold {concentration(rows, 5).toFixed(1)}% of bought volume as net buys.</p>
            <div className="grid-2">
              <BrokerTable title={tr("accumulators")} rows={acc} name={name} />
              <BrokerTable title={tr("distributors")} rows={dist} name={name} />
            </div>
          </>
        )}
      </Card>

      <Card title={tr("alerts")}>
        <form className="alert-form" onSubmit={(e) => { e.preventDefault(); void addAlert(); }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} aria-label="Alert type">
            {(["above", "below", "pctUp", "pctDown"] as AlertKind[]).map((k) => <option key={k} value={k}>{tr(k)}</option>)}
          </select>
          <input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={kind.startsWith("pct") ? "%" : "Rs"} aria-label="Alert value" />
          <button className="primary">{tr("addAlert")}</button>
        </form>
        {err && <p className="error" role="alert">{err}</p>}
        <ul className="alert-list">
          {myAlerts.map((a) => (
            <li key={a.id}>
              <span>{describeAlert(a)}</span>
              {a.firedAt && <span className="badge">{tr("fired")}</span>}
              <button className="ghost" onClick={() => setAlerts(alerts.filter((x) => x.id !== a.id))} aria-label={`${tr("delete")} ${describeAlert(a)}`}>✕</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

}

function BrokerTable({ title, rows, name }: { title: string; rows: ReturnType<typeof netByBroker>; name: (b: number) => string }) {
  const { lang, tr, go } = useApp();
  return (
    <div className="table-wrap">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr><th>{tr("broker")}</th><th className="r">{tr("netQty")}</th><th className="r">{tr("avgBuy")}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.broker}>
              <td><button className="link" onClick={() => go(`#/brokers/${r.broker}`)} title={name(r.broker)}>#{r.broker} <small className="muted">{short(name(r.broker))}</small></button></td>
              <td className={`r tabular ${r.netQty > 0 ? "up" : "down"}`}>{r.netQty > 0 ? "▲" : "▼"} {formatCompact(Math.abs(r.netQty), lang)}</td>
              <td className="r tabular">{formatPrice(r.avgBuy, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtRet(r: number | null) {
  return r == null ? "—" : `${r > 0 ? "▲ +" : r < 0 ? "▼ " : ""}${r.toFixed(1)}%`;
}

export function short(name: string) {
  return name.replace(/\s*\(?(Pvt|PVT|Private|Limited|Ltd)\.?\)?/g, "").replace(/\s+/g, " ").trim().slice(0, 22);
}
