import { Card, StockList, useApp } from "../components/ui";
import { describeAlert } from "../lib/alerts";

export default function Watchlist() {
  const { data, tr, watchlist, alerts, setAlerts, go } = useApp();
  const stocks = watchlist.map((s) => data.stocks.find((x) => x.symbol === s)).filter((x) => x != null);
  return (
    <div className="page">
      <Card title={tr("watchlist")}>{stocks.length ? <StockList stocks={stocks} /> : <p className="muted empty">{tr("emptyWatch")}</p>}</Card>
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
