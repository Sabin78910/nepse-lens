import { useEffect, useState } from "react";
import { Card, Change, Segmented, useApp } from "../components/ui";
import { Sparkline } from "../components/Charts";
import { describeAlert } from "../lib/alerts";
import { formatPrice } from "../lib/format";
import { load, save, KEYS } from "../lib/storage";
import { isSortMode, loadSparkline, moveItem, sortStocks, type SortMode } from "../lib/watchlist";
import type { Stock } from "../lib/data";
import { SRC } from "../useMarket";

function WatchRow({ s, first, last, manual, onMove }: { s: Stock; first: boolean; last: boolean; manual: boolean; onMove: (dir: -1 | 1) => void }) {
  const { data, lang, tr, go } = useApp();
  const [closes, setCloses] = useState<number[]>([]);
  useEffect(() => {
    let live = true;
    void loadSparkline(SRC, data.mode, s.symbol).then((c) => live && setCloses(c));
    return () => {
      live = false;
    };
  }, [s.symbol, data.mode]);
  return (
    <li className="watch-item">
      <button className="stock-row watch-row" onClick={() => go(`#/stock/${s.symbol}`)}>
        <span className="sym">
          <strong>{s.symbol}</strong>
          <small className="muted">{s.name}</small>
        </span>
        <Sparkline values={closes} up={closes.length > 1 ? closes[closes.length - 1] >= closes[0] : s.pct >= 0} width={72} height={28} label={`${s.symbol} ${tr("trend30")}`} />
        <span className="num tabular">{formatPrice(s.ltp, lang)}</span>
        <Change pct={s.pct} lang={lang} />
      </button>
      {manual && (
        <span className="move">
          <button className="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={`${tr("moveUp")}: ${s.symbol}`}>↑</button>
          <button className="ghost" disabled={last} onClick={() => onMove(1)} aria-label={`${tr("moveDown")}: ${s.symbol}`}>↓</button>
        </span>
      )}
    </li>
  );
}

export default function Watchlist() {
  const { data, tr, watchlist, setWatchlist, alerts, setAlerts, go } = useApp();
  const [sort, setSortState] = useState<SortMode>(() => {
    const v = load<string>(KEYS.watchSort, "manual");
    return isSortMode(v) ? v : "manual";
  });
  const setSort = (m: SortMode) => (setSortState(m), save(KEYS.watchSort, m));
  const stocks = sortStocks(watchlist.map((s) => data.stocks.find((x) => x.symbol === s)).filter((x) => x != null), sort);
  return (
    <div className="page">
      <Card
        title={tr("watchlist")}
        actions={
          <Segmented
            label={tr("sortBy")}
            value={sort}
            onChange={setSort}
            options={[
              { value: "manual", label: tr("sortManual") },
              { value: "change", label: tr("sortChange") },
              { value: "turnover", label: tr("sortTurnover") },
              { value: "name", label: tr("sortName") },
            ]}
          />
        }
      >
        {stocks.length ? (
          <ul className="stock-list">
            {stocks.map((s, i) => (
              <WatchRow key={s.symbol} s={s} first={i === 0} last={i === stocks.length - 1} manual={sort === "manual"} onMove={(d) => setWatchlist(moveItem(watchlist, s.symbol, d))} />
            ))}
          </ul>
        ) : (
          <p className="muted empty">{tr("emptyWatch")}</p>
        )}
      </Card>
      <Card title={tr("alerts")}>
        {alerts.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="alert-list">
            {alerts.map((a) => (
              <li key={a.id}>
                <button className="link" onClick={() => go(`#/stock/${a.symbol}`)}>{describeAlert(a)}</button>
                {a.firedAt && <span className="badge">{tr("fired")}</span>}
                <button className="ghost" onClick={() => setAlerts(alerts.filter((x) => x.id !== a.id))} aria-label={`${tr("delete")} ${describeAlert(a)}`}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
