import { useState } from "react";
import { Card, Segmented, useApp } from "../components/ui";
import { breakEvenPrice, buyCost, sellResult, FEE_SCHEDULE_NOTE } from "../lib/fees";
import { formatNumber, formatRs, type Lang } from "../lib/format";

export default function More({ lang, setLang, theme, setTheme, canInstall, install }: {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  canInstall: boolean;
  install: () => void;
}) {
  const { data, tr } = useApp();
  const [tab, setTab] = useState<"open" | "upcoming" | "closed">("open");
  const issues = data.issues.filter((i) => i.status === tab).slice(0, 25);
  return (
    <div className="page">
      <Calculator />
      <Card
        title={tr("ipo")}
        actions={<Segmented label="Status" value={tab} onChange={setTab} options={[{ value: "open", label: tr("openNow") }, { value: "upcoming", label: tr("upcoming") }, { value: "closed", label: tr("closedIssue") }]} />}
      >
        {issues.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="issue-list">
            {issues.map((i) => (
              <li key={`${i.type}-${i.symbol}-${i.open}`}>
                <div>
                  <span className="badge">{i.type}</span> <strong>{i.symbol}</strong>
                  <p className="muted small">{i.company}</p>
                </div>
                <div className="r tabular small">
                  <div>{i.open ?? "TBA"} → {i.close ?? "TBA"}</div>
                  <div className="muted">{formatNumber(i.units, 0, lang)} @ Rs {i.price}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{tr("source")}: sharesansar.com</p>
      </Card>
      <Card title={tr("settings")}>
        <div className="setting">
          <span>{tr("language")}</span>
          <Segmented label={tr("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "ne", label: "नेपाली" }]} />
        </div>
        <div className="setting">
          <span>{tr("theme")}</span>
          <Segmented label={tr("theme")} value={theme} onChange={setTheme} options={[{ value: "dark", label: tr("dark") }, { value: "light", label: tr("light") }]} />
        </div>
        {canInstall && <button className="primary" onClick={install}>{tr("install")}</button>}
        <p className="small">
          <a href="https://sabin78910.github.io/privacy-policy/" target="_blank" rel="noreferrer">{tr("privacy")}</a> ·{" "}
          <a href="https://github.com/Sabin78910/nepse-lens" target="_blank" rel="noreferrer">GitHub</a>
        </p>
        <p className="muted small">{tr("source")}: nepalstock.com (unofficial). {tr("disclaimer")}</p>
      </Card>
    </div>
  );
}

function Calculator() {
  const { lang, tr } = useApp();
  const [qty, setQty] = useState("100");
  const [buy, setBuy] = useState("500");
  const [sell, setSell] = useState("550");
  const [days, setDays] = useState("30");
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const b = buyCost(q, Number(buy) || 0);
  const s = sellResult(q, Number(sell) || 0, b.costPerShare, Number(days) || 0);
  const be = breakEvenPrice(q, b.costPerShare);
  return (
    <Card title={tr("calculator")}>
      <div className="calc-grid">
        <label>{tr("qty")}<input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label>{tr("buy")} {tr("price")}<input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} /></label>
        <label>{tr("sell")} {tr("price")}<input inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} /></label>
        <label>{tr("holdingDays")}<input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
      </div>
      <dl className="calc-out tabular">
        <dt>{tr("payable")}</dt><dd>{formatRs(b.total, lang)}</dd>
        <dt>{tr("wacc")}</dt><dd>{formatRs(b.costPerShare, lang)}</dd>
        <dt>{tr("commission")}</dt><dd>{formatRs(b.commission + s.commission, lang)}</dd>
        <dt>{tr("sebon")}</dt><dd>{formatRs(b.sebon + s.sebon, lang)}</dd>
        <dt>{tr("dp")}</dt><dd>{formatRs(b.dp + s.dp, lang)}</dd>
        <dt>{tr("cgt")}</dt><dd>{formatRs(s.cgt, lang)}</dd>
        <dt>{tr("receivable")}</dt><dd>{formatRs(s.receivable, lang)}</dd>
        <dt>{tr("profit")}</dt><dd className={s.netProfit >= 0 ? "up" : "down"}>{s.netProfit >= 0 ? "▲" : "▼"} {formatRs(s.netProfit, lang)}</dd>
        <dt>{tr("breakEven")}</dt><dd>{formatRs(be, lang)}</dd>
      </dl>
      <p className="muted small">{FEE_SCHEDULE_NOTE}</p>
    </Card>
  );
}
