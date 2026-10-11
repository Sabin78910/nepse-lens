import { useMemo, useRef, useState } from "react";
import { Card, Segmented, useApp } from "../components/ui";
import { holdings, totals, valueHoldings, type Txn } from "../lib/portfolio";
import { formatChange, formatPct, formatPrice, formatQty, formatRs, ARROW, direction } from "../lib/format";
import { nptDateString } from "../lib/market";
import { dedupe, parseCsv, toCsv, toJson, type CsvError } from "../lib/portfolioCsv";

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Portfolio() {
  const { data, lang, tr, txns, setTxns, go } = useApp();
  const today = nptDateString(new Date());
  const [side, setSide] = useState<Txn["side"]>("buy");
  const [sym, setSym] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErrs, setImportErrs] = useState<CsvError[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    const known = new Set(data.securities.map((x) => x.s));
    const res = parseCsv(await file.text(), known);
    const { added, duplicates } = dedupe(txns, res.txns);
    if (added.length) setTxns([...txns, ...added]);
    setImportErrs(res.errors);
    setImportMsg(tr("importDone", { added: String(added.length), dupes: String(duplicates) }));
  };

  const prices = useMemo(() => new Map(data.stocks.map((s) => [s.symbol, { ltp: s.ltp, change: s.change }])), [data.stocks]);
  const vals = useMemo(() => valueHoldings(holdings(txns), prices, today), [txns, prices, today]);
  const tot = totals(vals);

  const add = () => {
    const s = sym.trim().toUpperCase();
    const q = Number(qty);
    const p = side === "bonus" ? 0 : Number(price);
    if (!data.securities.some((x) => x.s === s)) return setErr("Unknown symbol");
    if (!(q > 0) || !Number.isInteger(q)) return setErr("Quantity must be a whole number");
    if (side !== "bonus" && !(p > 0)) return setErr("Enter a price");
    setErr(null);
    setTxns([...txns, { id: Math.random().toString(36).slice(2, 10), symbol: s, side, qty: q, price: p, date }]);
    setQty("");
    setPrice("");
  };

  return (
    <div className="page">
      <Card className="hero">
        <dl className="stats">
          <div><dt>{tr("invested")}</dt><dd className="tabular">{formatRs(tot.invested, lang, true)}</dd></div>
          <div><dt>{tr("current")}</dt><dd className="tabular">{formatRs(tot.value, lang, true)}</dd></div>
          <div><dt>{tr("unrealized")}</dt><dd className={`tabular ${direction(tot.unrealized)}`}>{ARROW[direction(tot.unrealized)]} {formatRs(tot.unrealized, lang, true)} ({formatPct(tot.unrealizedPct, lang)})</dd></div>
          <div><dt>{tr("today")}</dt><dd className={`tabular ${direction(tot.day)}`}>{ARROW[direction(tot.day)]} {formatChange(tot.day, lang)}</dd></div>
        </dl>
      </Card>

      <Card title={tr("holdings")}>
        {vals.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Symbol</th><th className="r">{tr("qty")}</th><th className="r">{tr("wacc")}</th><th className="r">{tr("ltp")}</th><th className="r">P/L</th></tr>
              </thead>
              <tbody>
                {vals.map((v) => (
                  <tr key={v.symbol}>
                    <td><button className="link" onClick={() => go(`#/stock/${v.symbol}`)}>{v.symbol}</button></td>
                    <td className="r tabular">{formatQty(v.qty, lang)}</td>
                    <td className="r tabular">{formatPrice(v.wacc, lang)}</td>
                    <td className="r tabular">{formatPrice(v.ltp, lang)}</td>
                    <td className={`r tabular ${direction(v.unrealized)}`}>{ARROW[direction(v.unrealized)]} {formatPct(v.unrealizedPct, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={tr("addTxn")}>
        <form className="txn-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Segmented label="Side" value={side} onChange={setSide} options={[{ value: "buy", label: tr("buy") }, { value: "sell", label: tr("sell") }, { value: "bonus", label: tr("bonus") }]} />
          <input list="symbols" value={sym} onChange={(e) => setSym(e.target.value)} placeholder="NABIL" aria-label="Symbol" autoCapitalize="characters" />
          <datalist id="symbols">{data.securities.slice(0, 600).map((s) => <option key={s.s} value={s.s}>{s.n}</option>)}</datalist>
          <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={tr("qty")} aria-label={tr("qty")} />
          {side !== "bonus" && <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={tr("price")} aria-label={tr("price")} />}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={tr("date")} />
          <button className="primary">{tr("addTxn")}</button>
        </form>
        {err && <p className="error" role="alert">{err}</p>}
        <ul className="alert-list">
          {[...txns].reverse().slice(0, 20).map((t) => (
            <li key={t.id}>
              <span className="tabular">{t.date} · {tr(t.side)} {t.symbol} {formatQty(t.qty, lang)} @ {formatPrice(t.price, lang)}</span>
              <button className="ghost" onClick={() => setTxns(txns.filter((x) => x.id !== t.id))} aria-label={tr("delete")}>✕</button>
            </li>
          ))}
        </ul>
        <div className="txn-form">
          <button className="ghost" onClick={() => download(`nepse-lens-${today}.csv`, toCsv(txns), "text/csv")}>{tr("exportCsv")}</button>
          <button className="ghost" onClick={() => download(`nepse-lens-${today}.json`, toJson(txns), "application/json")}>{tr("exportJson")}</button>
          <button className="ghost" onClick={() => fileRef.current?.click()}>{tr("importCsv")}</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label={tr("importCsv")}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
        </div>
        <p className="muted small">{tr("importFormat")}</p>
        {importMsg && <p role="status">{importMsg}</p>}
        {importErrs.length > 0 && (
          <div role="alert" className="error">
            <p>{tr("importErrors", { n: String(importErrs.length) })}</p>
            <ul>{importErrs.map((e) => <li key={e.line}>{tr("importLine", { line: String(e.line), message: e.message })}</li>)}</ul>
          </div>
        )}
        <p className="muted small">{tr("backupNote")}</p>
      </Card>
    </div>
  );
}
