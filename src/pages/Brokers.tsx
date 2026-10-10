import { useEffect, useMemo, useState } from "react";
import { Card, Segmented, useApp } from "../components/ui";
import { loadData } from "../lib/api";
import { SRC } from "../useMarket";
import { formatCompact, type Lang } from "../lib/format";
import type { Window } from "../lib/accumulation";
import { short } from "./Stock";

interface Summary {
  asOf: string | null;
  windows: Record<Window, { from: string | null; to: string | null; days: number; brokers: Record<string, { buyAmt: number; sellAmt: number; buys: [string, number, number][]; sells: [string, number, number][] }> }>;
}

export default function Brokers({ broker }: { broker?: string }) {
  const { data, lang, tr, go } = useApp();
  const [sum, setSum] = useState<Summary | null>(null);
  const [win, setWin] = useState<Window>("1D");
  const [q, setQ] = useState("");

  useEffect(() => {
    void loadData<Summary>(SRC, data.mode, "brokers/summary.json").then(setSum);
  }, [data.mode]);

  const w = sum?.windows[win];
  const list = useMemo(() => {
    if (!w) return [];
    return Object.entries(w.brokers)
      .map(([id, b]) => ({ id, name: data.brokers[id] ?? `Broker ${id}`, total: b.buyAmt + b.sellAmt, net: b.buyAmt - b.sellAmt }))
      .filter((b) => !q || b.id === q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [w, data.brokers, q]);

  const sel = broker && w?.brokers[broker];

  return (
    <div className="page">
      <Card
        title={tr("brokers")}
        actions={<Segmented label="Window" value={win} onChange={setWin} options={(["1D", "1W", "1M", "3M", "ALL"] as Window[]).map((x) => ({ value: x, label: x === "ALL" ? "All" : x }))} />}
      >
        <p className="definition">ⓘ {tr("accumDefinition", { date: data.manifest.firstFloorsheetDay ?? "—" })}</p>
        {w && <p className="muted small tabular">{w.from} → {w.to} · {w.days} day(s)</p>}
        {sel ? (
          <div>
            <button className="ghost back" onClick={() => go("#/brokers")}>← {tr("back")}</button>
            <h3>#{broker} {data.brokers[broker!]}</h3>
            <p className="tabular">
              <span className="up">▲ {formatCompact(sel.buyAmt, lang)}</span> · <span className="down">▼ {formatCompact(sel.sellAmt, lang)}</span>
            </p>
            <div className="grid-2">
              <Picks title={tr("topBuys")} rows={sel.buys} up lang={lang} />
              <Picks title={tr("topSells")} rows={sel.sells} lang={lang} />
            </div>
          </div>
        ) : (
          <>
            <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("selectBroker")} aria-label={tr("selectBroker")} />
            {!sum ? (
              <div className="skeleton" />
            ) : (
              <ul className="broker-list">
                {list.map((b) => (
                  <li key={b.id}>
                    <button className="stock-row" onClick={() => go(`#/brokers/${b.id}`)}>
                      <span className="sym"><strong>#{b.id}</strong><small className="muted">{short(b.name)}</small></span>
                      <span className="num tabular">{formatCompact(b.total, lang)}</span>
                      <span className={`chg tabular ${b.net > 0 ? "up" : b.net < 0 ? "down" : "flat"}`}>{b.net > 0 ? "▲" : b.net < 0 ? "▼" : "■"} {formatCompact(Math.abs(b.net), lang)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Picks({ title, rows, up, lang }: { title: string; rows: [string, number, number][]; up?: boolean; lang: Lang }) {
  const { go } = useApp();
  return (
    <div className="table-wrap">
      <h3>{title}</h3>
      <table>
        <tbody>
          {rows.map(([sym, qty, amt]) => (
            <tr key={sym}>
              <td><button className="link" onClick={() => go(`#/stock/${sym}`)}>{sym}</button></td>
              <td className={`r tabular ${up ? "up" : "down"}`}>{up ? "▲" : "▼"} {formatCompact(Math.abs(qty), lang)}</td>
              <td className="r tabular muted">{formatCompact(Math.abs(amt), lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
