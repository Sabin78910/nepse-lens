"""Pure data shaping: floorsheet aggregation, broker accumulation, prices, latest snapshot, IPOs.

Nothing here touches the network or the disk, so every function is unit tested.
"""

from __future__ import annotations

import csv
import html
import io
import re
from collections import defaultdict
from typing import Any, Iterable

# (symbol, broker) -> [buy_qty, sell_qty, buy_amount, sell_amount]
Agg = dict[tuple[str, int], list[float]]

CSV_HEADER = ["symbol", "broker", "buy_qty", "sell_qty", "buy_amt", "sell_amt"]
WINDOWS = {"1D": 1, "1W": 5, "1M": 22, "3M": 66, "ALL": 0}  # trading days; 0 = everything


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def aggregate_floorsheet(rows: Iterable[dict[str, Any]]) -> Agg:
    """Sum each trade into the buyer's buy side and the seller's sell side, per (symbol, broker).

    Trades are de-duplicated by contractId, because pages can shift while they are fetched.
    """
    seen: set[Any] = set()
    agg: Agg = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    for r in rows:
        cid = r.get("contractId")
        if cid is not None:
            if cid in seen:
                continue
            seen.add(cid)
        sym = str(r.get("stockSymbol") or "").strip()
        if not sym:
            continue
        qty = _num(r.get("contractQuantity"))
        amt = _num(r.get("contractAmount"))
        try:
            buyer = int(r.get("buyerMemberId"))  # type: ignore[arg-type]
            seller = int(r.get("sellerMemberId"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        b = agg[(sym, buyer)]
        b[0] += qty
        b[2] += amt
        s = agg[(sym, seller)]
        s[1] += qty
        s[3] += amt
    return dict(agg)


def broker_names(rows: Iterable[dict[str, Any]]) -> dict[str, str]:
    names: dict[str, str] = {}
    for r in rows:
        for idk, nk in (("buyerMemberId", "buyerBrokerName"), ("sellerMemberId", "sellerBrokerName")):
            i, n = r.get(idk), r.get(nk)
            if i is not None and n:
                names[str(int(i))] = str(n).strip()
    return dict(sorted(names.items(), key=lambda kv: int(kv[0])))


def agg_to_csv(agg: Agg) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(CSV_HEADER)
    for (sym, broker), v in sorted(agg.items()):
        w.writerow([sym, broker, _fmt(v[0]), _fmt(v[1]), _fmt(v[2]), _fmt(v[3])])
    return buf.getvalue()


def agg_from_csv(text: str) -> Agg:
    agg: Agg = {}
    for row in csv.DictReader(io.StringIO(text)):
        agg[(row["symbol"], int(row["broker"]))] = [
            _num(row["buy_qty"]),
            _num(row["sell_qty"]),
            _num(row["buy_amt"]),
            _num(row["sell_amt"]),
        ]
    return agg


def _fmt(x: float) -> int | float:
    """Compact numbers: integers stay integers, amounts keep 2 decimals."""
    r = round(x, 2)
    return int(r) if r == int(r) else r


def accum_docs(daily: dict[str, Agg]) -> dict[str, dict[str, Any]]:
    """Per-symbol accumulation documents from {date: aggregate}.

    Shape: {"s": SYMBOL, "dates": [d0, d1, ...], "r": [[date_index, broker, buy_qty, sell_qty, buy_amt, sell_amt]]}
    Rebuilt from the full daily history, so re-running a day can never double count.
    """
    dates = sorted(daily)
    by_sym: dict[str, list[list[Any]]] = defaultdict(list)
    for i, d in enumerate(dates):
        for (sym, broker), v in sorted(daily[d].items()):
            by_sym[sym].append([i, broker, *(_fmt(x) for x in v)])
    out: dict[str, dict[str, Any]] = {}
    for sym, rows in by_sym.items():
        used = sorted({r[0] for r in rows})
        remap = {old: new for new, old in enumerate(used)}
        out[sym] = {
            "s": sym,
            "dates": [dates[i] for i in used],
            "r": [[remap[r[0]], *r[1:]] for r in rows],
        }
    return out


def window_dates(dates: list[str], window: str) -> list[str]:
    n = WINDOWS[window]
    ordered = sorted(dates)
    return ordered if n == 0 else ordered[-n:]


def broker_summary(daily: dict[str, Agg], top: int = 10) -> dict[str, Any]:
    """For each window and broker: total buy/sell amount plus the top net buys and net sells."""
    dates = sorted(daily)
    windows: dict[str, Any] = {}
    for w in WINDOWS:
        ds = window_dates(dates, w)
        net: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0.0]))
        for d in ds:
            for (sym, broker), v in daily[d].items():
                acc = net[broker][sym]
                for k in range(4):
                    acc[k] += v[k]
        brokers: dict[str, Any] = {}
        for broker, syms in net.items():
            rows = [
                (sym, v[0] - v[1], v[2] - v[3]) for sym, v in syms.items()
            ]
            buys = sorted((r for r in rows if r[2] > 0), key=lambda r: -r[2])[:top]
            sells = sorted((r for r in rows if r[2] < 0), key=lambda r: r[2])[:top]
            brokers[str(broker)] = {
                "buyAmt": _fmt(sum(v[2] for v in syms.values())),
                "sellAmt": _fmt(sum(v[3] for v in syms.values())),
                "buys": [[s, _fmt(q), _fmt(a)] for s, q, a in buys],
                "sells": [[s, _fmt(q), _fmt(a)] for s, q, a in sells],
            }
        windows[w] = {"from": ds[0] if ds else None, "to": ds[-1] if ds else None, "days": len(ds), "brokers": brokers}
    return {"asOf": dates[-1] if dates else None, "windows": windows}


# ---------- prices ----------

PriceRow = list[Any]  # [date, open, high, low, close, volume, turnover]


def price_rows(today_price: Iterable[dict[str, Any]]) -> dict[str, PriceRow]:
    out: dict[str, PriceRow] = {}
    for r in today_price:
        sym = r.get("symbol")
        d = r.get("businessDate")
        close = r.get("closePrice")
        if not sym or not d or close is None:
            continue
        out[sym] = [
            d,
            _fmt(_num(r.get("openPrice"))),
            _fmt(_num(r.get("highPrice"))),
            _fmt(_num(r.get("lowPrice"))),
            _fmt(_num(close)),
            _fmt(_num(r.get("totalTradedQuantity"))),
            _fmt(_num(r.get("totalTradedValue"))),
        ]
    return out


def upsert_price(doc: dict[str, Any] | None, symbol: str, row: PriceRow) -> dict[str, Any]:
    """Insert or replace one day's row, keeping rows sorted by date (idempotent)."""
    rows = [r for r in (doc or {}).get("d", []) if r[0] != row[0]]
    rows.append(row)
    rows.sort(key=lambda r: r[0])
    return {"s": symbol, "d": rows}


def index_history(content: Iterable[dict[str, Any]]) -> list[list[Any]]:
    rows = [
        [r["businessDate"], _fmt(_num(r.get("openIndex"))), _fmt(_num(r.get("highIndex"))),
         _fmt(_num(r.get("lowIndex"))), _fmt(_num(r.get("closingIndex"))), _fmt(_num(r.get("turnoverValue")))]
        for r in content
        if r.get("businessDate") and r.get("closingIndex") is not None
    ]
    uniq = {r[0]: r for r in rows}
    return [uniq[k] for k in sorted(uniq)]


def merge_index_history(old: list[list[Any]], new: list[list[Any]]) -> list[list[Any]]:
    merged = {r[0]: r for r in old}
    merged.update({r[0]: r for r in new})
    return [merged[k] for k in sorted(merged)]


# ---------- latest snapshot ----------

SUMMARY_KEYS = {
    "Total Turnover Rs:": "turnover",
    "Total Traded Shares": "shares",
    "Total Transactions": "transactions",
    "Total Scrips Traded": "scrips",
    "Total Market Capitalization Rs:": "marketCap",
    "Total Float Market Capitalization Rs:": "floatMarketCap",
}


def summary_doc(summary: Iterable[dict[str, Any]]) -> dict[str, float]:
    out: dict[str, float] = {}
    for r in summary:
        k = SUMMARY_KEYS.get(str(r.get("detail", "")).strip())
        if k:
            out[k] = _fmt(_num(r.get("value")))
    return out


def index_doc(r: dict[str, Any]) -> dict[str, Any]:
    # NEPSE's own field names are inconsistent ("close" holds the previous close); derive from value - change.
    value = _num(r.get("currentValue"))
    change = _num(r.get("change"))
    return {
        "id": r.get("id"),
        "name": r.get("index"),
        "value": _fmt(value),
        "change": _fmt(change),
        "pct": _fmt(_num(r.get("perChange"))),
        "prev": _fmt(value - change),
        "high": _fmt(_num(r.get("high"))) if r.get("high") is not None else None,
        "low": _fmt(_num(r.get("low"))) if r.get("low") is not None else None,
        "w52High": _fmt(_num(r.get("fiftyTwoWeekHigh"))) if r.get("fiftyTwoWeekHigh") is not None else None,
        "w52Low": _fmt(_num(r.get("fiftyTwoWeekLow"))) if r.get("fiftyTwoWeekLow") is not None else None,
    }


# stock row: [symbol, ltp, pct, prevClose, open, high, low, qty, turnover, updated]
def stock_rows(live: Iterable[dict[str, Any]], price_volume: Iterable[dict[str, Any]]) -> list[list[Any]]:
    """Merge the live market (traded today) with the price/volume list (which also has untraded prev closes)."""
    rows: dict[str, list[Any]] = {}
    for r in price_volume:
        sym = r.get("symbol")
        if not sym:
            continue
        ltp = _num(r.get("lastTradedPrice") or r.get("closePrice"))
        prev = _num(r.get("previousClose"))
        rows[sym] = [sym, _fmt(ltp), _fmt(round(_num(r.get("percentageChange")), 2)), _fmt(prev),
                     None, None, None, _fmt(_num(r.get("totalTradeQuantity"))), None, None]
    for r in live:
        sym = r.get("symbol")
        if not sym:
            continue
        ltp = _num(r.get("lastTradedPrice"))
        prev = _num(r.get("previousClose"))
        pct = round((ltp - prev) / prev * 100, 2) if prev else _num(r.get("percentageChange"))
        rows[sym] = [sym, _fmt(ltp), _fmt(pct), _fmt(prev), _fmt(_num(r.get("openPrice"))),
                     _fmt(_num(r.get("highPrice"))), _fmt(_num(r.get("lowPrice"))),
                     _fmt(_num(r.get("totalTradeQuantity"))), _fmt(_num(r.get("totalTradeValue"))),
                     r.get("lastUpdatedDateTime")]
    return [rows[k] for k in sorted(rows)]


def latest_doc(
    *,
    fetched_at: str,
    status: dict[str, Any],
    summary: list[dict[str, Any]],
    indices: list[dict[str, Any]],
    subindices: list[dict[str, Any]],
    live: list[dict[str, Any]],
    price_volume: list[dict[str, Any]],
    intraday: list[list[Any]] | None,
) -> dict[str, Any]:
    return {
        "v": 1,
        "source": "nepalstock.com (unofficial, delayed)",
        "fetchedAt": fetched_at,
        "status": {"isOpen": status.get("isOpen"), "asOf": status.get("asOf")},
        "summary": summary_doc(summary),
        "indices": [index_doc(r) for r in indices],
        "subindices": [
            {"id": r.get("id"), "name": r.get("index"), "value": _fmt(_num(r.get("currentValue"))),
             "change": _fmt(_num(r.get("change"))), "pct": _fmt(_num(r.get("perChange")))}
            for r in subindices
        ],
        "intraday": [[int(t), _fmt(_num(v))] for t, v in (intraday or [])],
        "stocks": stock_rows(live, price_volume),
    }


def securities_doc(companies: Iterable[dict[str, Any]], securities: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Symbol, name and sector only. Company e-mails and websites are deliberately dropped."""
    sector = {c.get("symbol"): c.get("sectorName") for c in companies}
    out = []
    for s in securities:
        sym = s.get("symbol")
        if not sym or s.get("activeStatus", "A") != "A":
            continue
        out.append({"s": sym, "n": (s.get("securityName") or "").strip(), "sec": sector.get(sym) or "Promoter Share", "id": s.get("id")})
    return sorted(out, key=lambda x: x["s"])


# ---------- IPO / FPO / right shares (ShareSansar existing-issues) ----------

ISSUE_TYPES = {1: "IPO", 2: "FPO", 3: "Right", 5: "IPO (local)"}
_TAG = re.compile(r"<[^>]+>")


def strip_html(v: Any) -> str:
    return html.unescape(_TAG.sub("", str(v or ""))).strip()


def issue_status(code: Any) -> str:
    return {-2: "upcoming", -1: "upcoming", 0: "open", 1: "closed"}.get(code if isinstance(code, int) else -99, "unknown")


def issues_doc(by_type: dict[int, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    out = []
    for t, rows in by_type.items():
        for r in rows:
            comp = r.get("company") or {}
            out.append({
                "type": ISSUE_TYPES.get(t, str(t)),
                "symbol": strip_html(comp.get("symbol")),
                "company": strip_html(comp.get("companyname")),
                "units": _fmt(_num(r.get("total_units"))),
                "price": _fmt(_num(r.get("issue_price"))),
                "open": r.get("opening_date") or None,
                "close": r.get("closing_date") or None,
                "status": issue_status(r.get("status")),
                "manager": strip_html(r.get("issue_manager")) or None,
            })
    rank = {"open": 0, "upcoming": 1, "closed": 2, "unknown": 3}
    out.sort(key=lambda x: (rank[x["status"]], -(int((x["open"] or "0000-00-00").replace("-", "")))))
    return out
