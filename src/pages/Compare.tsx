import { useEffect, useMemo, useState } from "react";
import { Card, Change, useApp } from "../components/ui";
import { CompareChart } from "../components/Charts";
import { loadData } from "../lib/api";
import { SRC } from "../useMarket";
import type { PriceRow } from "../lib/data";
import { search } from "../lib/data";
import type { AccumDoc } from "../lib/accumulation";
import { MAX_COMPARE, compareHash, normalise, parseCompare, toggleSymbol, topAccumulation, weekRange } from "../lib/compare";
import { formatCompact, formatPrice, formatQty } from "../lib/format";

export default function Compare({ hash }: { hash: string }) {
  const { data, lang, tr, go } = useApp();
  const { symbols, from } = useMemo(() => parseCompare(hash), [hash]);
  const [prices, setPrices] = useState<Record<string, PriceRow[]>>({});
  const [accum, setAccum] = useState<Record<string, AccumDoc | null>>({});
  const [more, setMore] = useState(false);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const key = symbols.join(",");

  useEffect(() => {
    let live = true;
    for (const s of key ? key.split(",") : []) {
      void loadData<{ d: PriceRow[] }>(SRC, data.mode, `prices/${s}.json`).then((d) => live && setPrices((p) => ({ ...p, [s]: d?.d ?? [] })));
      void loadData<AccumDoc>(SRC, data.mode, `accum/${s}.json`).then((d) => live && setAccum((a) => ({ ...a, [s]: d ?? null })));
    }
    return () => {
      live = false;
    };
  }, [key, data.mode]);

  const loaded = symbols.filter((s) => prices[s]);
  const norm = useMemo(() => normalise(Object.fromEntries(loaded.map((s) => [s, prices[s]])), from), [loaded, prices, from]);
  const update = (next: string[], f = from) => go(compareHash(next, f));
  const matches = search(data.securities, q, 6).filter((m) => !symbols.includes(m.s));
  const rows = symbols.map((s) => ({ s, stock: data.stocks.find((x) => x.symbol === s), hist: prices[s], doc: accum[s] }));

  const cols: { label: string; cell: (r: (typeof rows)[number]) => React.ReactNode; extra?: boolean }[] = [
    { label: tr("ltp"), cell: (r) => formatPrice(r.stock?.ltp, lang) },
    { label: tr("change"), cell: (r) => (r.stock ? <Change pct={r.stock.pct} change={r.stock.change} lang={lang} /> : "—") },
    { label: tr("week52"), cell: (r) => { const w = r.hist && weekRange(r.hist); return w ? `${formatPrice(w.low, lang)} – ${formatPrice(w.high, lang)}` : "—"; } },
    { label: tr("turnover"), cell: (r) => formatCompact(r.stock?.turnover, lang) },
    { label: tr("volume"), cell: (r) => formatQty(r.stock?.qty, lang), extra: true },
    { label: tr("topNet"), cell: (r) => { const n = topAccumulation(r.doc ?? null, data.manifest.floorsheetDays ?? []); return n == null ? "—" : `▲ ${formatCompact(n, lang)}`; }, extra: true },
  ];
  const shown = cols.filter((c) => more || !c.extra);

  const copy = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
  };

  return (
    <div className="page">
      <Card title={tr("compare")}>
        <p className="muted small">{tr("compareHint")}</p>
        <ul className="chips">
          {symbols.map((s) => (
            <li key={s}>
              <button className="ghost" onClick={() => update(toggleSymbol(symbols, s))} aria-label={`${tr("compareRemove")} ${s}`}>{s} ✕</button>
            </li>
          ))}
        </ul>
        {symbols.length < MAX_COMPARE && (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("compareAdd")} aria-label={tr("compareAdd")} />
            <ul className="chips">
              {matches.map((m) => (
                <li key={m.s}><button className="ghost" onClick={() => { update(toggleSymbol(symbols, m.s)); setQ(""); }}>+ {m.s}</button></li>
              ))}
            </ul>
          </>
        )}
        <label>{tr("compareFrom")}<input type="date" value={from ?? norm.start ?? ""} onChange={(e) => update(symbols, e.target.value || null)} /></label>
      </Card>

      {symbols.length >= 2 && (
        <Card
          title={tr("compareChart")}
          actions={<button className="ghost" onClick={() => void copy()}>{copied ? tr("compareCopied") : tr("compareCopy")}</button>}
        >
          {loaded.length < symbols.length ? <div className="skeleton chart-skel" /> : norm.dates.length < 2 ? <p className="muted">{tr("compareNoOverlap")}</p> : <CompareChart norm={norm} lang={lang} />}
        </Card>
      )}

      {symbols.length > 0 && (
        <Card actions={<button className="ghost" aria-expanded={more} onClick={() => setMore(!more)}>{more ? tr("compareLess") : tr("compareMore")}</button>}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{tr("compare")}</th>{shown.map((c) => <th key={c.label} className="r">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.s}>
                    <td><button className="link" onClick={() => go(`#/stock/${r.s}`)}>{r.s}</button></td>
                    {shown.map((c) => <td key={c.label} className="r tabular">{c.cell(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {more && <p className="definition">ⓘ {tr("accumDefinition", { date: data.manifest.firstFloorsheetDay ?? "—" })}</p>}
          <p className="muted small">{tr("disclaimer")}</p>
        </Card>
      )}
    </div>
  );
}
