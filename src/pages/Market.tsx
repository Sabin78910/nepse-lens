import { useMemo, useState } from "react";
import { Card, Change, Segmented, StockList, useApp } from "../components/ui";
import { Sparkline } from "../components/Charts";
import { breadth, mostActive, sectorHeatmap, topGainers, topLosers } from "../lib/data";
import { formatCompact, formatNumber, formatPrice } from "../lib/format";
import { sectorName } from "../lib/i18n";

type Tab = "gainers" | "losers" | "active";

export default function Market() {
  const { data, lang, tr } = useApp();
  const [tab, setTab] = useState<Tab>("gainers");
  const nepse = data.latest.indices.find((i) => i.id === 58) ?? data.latest.indices[0];
  const others = data.latest.indices.filter((i) => i !== nepse);
  const spark = useMemo(() => {
    const intra = data.latest.intraday.map(([, v]) => v);
    return intra.length > 5 ? intra : data.indexHistory.slice(-60).map((r) => r[4]);
  }, [data]);
  const b = breadth(data.stocks);
  const lists: Record<Tab, typeof data.stocks> = {
    gainers: topGainers(data.stocks, 8),
    losers: topLosers(data.stocks, 8),
    active: mostActive(data.stocks, 8),
  };
  const heat = sectorHeatmap(data.stocks);
  const s = data.latest.summary;
  const total = b.up + b.down + b.flat || 1;

  return (
    <div className="page">
      {nepse && (
        <Card className="hero">
          <div className="hero-top">
            <div>
              <p className="eyebrow">{nepse.name}</p>
              <p className="hero-value tabular">{formatNumber(nepse.value, 2, lang)}</p>
              <Change pct={nepse.pct} change={nepse.change} lang={lang} big />
            </div>
            <Sparkline values={spark} up={nepse.change >= 0} width={150} height={64} label="NEPSE index trend" />
          </div>
          <dl className="stats">
            <div><dt>{tr("turnover")}</dt><dd className="tabular">{formatCompact(s.turnover, lang)}</dd></div>
            <div><dt>{tr("shares")}</dt><dd className="tabular">{formatCompact(s.shares, lang)}</dd></div>
            <div><dt>{tr("transactions")}</dt><dd className="tabular">{formatNumber(s.transactions ?? 0, 0, lang)}</dd></div>
            <div><dt>{tr("marketCap")}</dt><dd className="tabular">{formatCompact(s.marketCap, lang)}</dd></div>
          </dl>
          <div className="breadth" aria-label={`${tr("breadth")}: ${b.up} up, ${b.down} down, ${b.flat} unchanged`}>
            <span className="up" style={{ flex: b.up / total }} />
            <span className="flat" style={{ flex: b.flat / total }} />
            <span className="down" style={{ flex: b.down / total }} />
          </div>
          <p className="breadth-label tabular">
            <span className="up">▲ {b.up}</span> <span className="muted">■ {b.flat}</span> <span className="down">▼ {b.down}</span>
          </p>
        </Card>
      )}

      <div className="chips" role="list">
        {others.map((i) => (
          <div className="chip" role="listitem" key={i.id}>
            <small>{i.name}</small>
            <strong className="tabular">{formatPrice(i.value, lang)}</strong>
            <Change pct={i.pct} lang={lang} />
          </div>
        ))}
      </div>

      <div className="grid-2">
        <Card
          title={tr(tab === "gainers" ? "gainers" : tab === "losers" ? "losers" : "active")}
          actions={
            <Segmented
              label="List"
              value={tab}
              onChange={setTab}
              options={[
                { value: "gainers", label: "▲" },
                { value: "losers", label: "▼" },
                { value: "active", label: "Rs" },
              ]}
            />
          }
        >
          <StockList stocks={lists[tab]} />
        </Card>

        <Card title={tr("heatmap")}>
          <div className="heatmap">
            {heat.map((h) => {
              const a = Math.min(1, Math.abs(h.pct) / 3);
              const bg = h.pct >= 0 ? `rgba(34,197,94,${0.12 + a * 0.55})` : `rgba(239,68,68,${0.12 + a * 0.55})`;
              return (
                <div className="tile" key={h.sector} style={{ background: bg }} title={sectorName(lang, h.sector)}>
                  <span className="tile-name">{sectorName(lang, h.sector)}</span>
                  <Change pct={h.pct} lang={lang} />
                  <small className="tabular">{formatCompact(h.turnover, lang)}</small>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Sub-indices">
        <ul className="sub-list">
          {data.latest.subindices.map((x) => (
            <li key={x.id}>
              <span>{x.name}</span>
              <span className="tabular">{formatPrice(x.value, lang)}</span>
              <Change pct={x.pct} lang={lang} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
