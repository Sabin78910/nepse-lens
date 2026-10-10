"""NEPSE Lens collector.

  python -m nepse_lens live  --out live/          # market snapshot -> live/latest.json
  python -m nepse_lens eod   --data data/ [--date YYYY-MM-DD] [--catchup 10]
  python -m nepse_lens backfill-prices --data data/ --days 250
  python -m nepse_lens issues --data data/

Every command is idempotent: re-running it rewrites the same files with the same content.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, datetime, timezone

from . import aggregate as A
from .market import missing_days, recent_trading_days, should_run_live, to_npt
from .store import Store


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().replace(microsecond=0).isoformat()


def load_holidays(store: Store, src, year: int) -> set[str]:
    doc = store.read_json("meta/holidays.json", {}) or {}
    if str(year) not in doc and src is not None:
        try:
            doc[str(year)] = sorted({h["holidayDate"] for h in src.holidays(year) if h.get("holidayDate")})
            store.write_json("meta/holidays.json", doc)
        except Exception as e:  # holidays only refine the calendar; weekends still work without them
            print(f"warn: holidays unavailable: {e}")
    return {d for days in doc.values() for d in days}


def cmd_live(args) -> int:
    from .fetch import NepseSource

    out = Store(args.out)
    holidays = load_holidays(Store(args.data), None, 0) if args.data else set()
    if not args.force and not should_run_live(now_utc(), holidays):
        print("Market closed; skipping the live snapshot (use --force to override).")
        return 0
    src = NepseSource()
    status = src.status()
    try:
        intraday = src.intraday()
    except Exception as e:
        print(f"warn: intraday graph unavailable: {e}")
        intraday = []
    doc = A.latest_doc(
        fetched_at=iso_now(),
        status=status,
        summary=src.summary(),
        indices=src.indices(),
        subindices=src.subindices(),
        live=src.live(),
        price_volume=src.price_volume(),
        intraday=intraday,
    )
    out.write_json("latest.json", doc)
    print(f"latest.json: {len(doc['stocks'])} stocks, status {doc['status']}")
    return 0


def refresh_meta(store: Store, src) -> None:
    store.write_json("meta/securities.json", A.securities_doc(src.companies(), src.securities()))


def catch_up_prices(store: Store, src, latest_day: str, count: int, holidays: set[str]) -> list[str]:
    m = store.manifest()
    have = set(m.get("priceDays", [])) | set(m.get("noTradeDays", []))
    today = date.fromisoformat(latest_day)
    todo = missing_days(recent_trading_days(today, count, holidays), have)
    done: list[str] = []
    no_trade: list[str] = list(m.get("noTradeDays", []))
    for d in todo:
        day = d.isoformat()
        try:
            rows = src.today_price(day)
        except Exception as e:
            print(f"warn: prices for {day} unavailable ({e}); will retry next run")
            continue
        per = A.price_rows(rows)
        if not per:
            no_trade.append(day)  # an unannounced closure; remember it so we stop asking
            continue
        for sym, row in per.items():
            rel = f"prices/{sym}.json"
            store.write_json(rel, A.upsert_price(store.read_json(rel), sym, row))
        done.append(day)
        print(f"prices {day}: {len(per)} symbols")
    store.update_manifest(
        priceDays=sorted(set(m.get("priceDays", [])) | set(done)),
        noTradeDays=sorted(set(no_trade)),
    )
    return done


def rebuild_derived(store: Store) -> None:
    daily = store.load_daily()
    for sym, doc in A.accum_docs(daily).items():
        store.write_json(f"accum/{sym}.json", doc)
    store.write_json("brokers/summary.json", A.broker_summary(daily))
    print(f"rebuilt accumulation for {len(daily)} day(s)")


def cmd_eod(args) -> int:
    from .fetch import NepseSource

    store = Store(args.data)
    src = NepseSource()
    today = to_npt(now_utc()).date()
    holidays = load_holidays(store, src, today.year)
    status = src.status()
    latest_day = str(status.get("asOf", ""))[:10]
    target = args.date or latest_day
    print(f"NEPSE latest business day {latest_day}; target {target}")

    if args.meta or not store.path("meta/securities.json").exists():
        refresh_meta(store, src)

    changed = False
    if store.has_floorsheet(target) and not args.force:
        print(f"floorsheet {target}: already stored")
    elif target != latest_day:
        print(f"floorsheet {target}: NEPSE only serves the latest day's floorsheet ({latest_day}); cannot backfill.")
    else:
        rows = src.floorsheet()
        days = {r.get("businessDate") for r in rows}
        if days != {target}:
            print(f"floorsheet dates {sorted(map(str, days))} != {target}; not saving a partial day")
        else:
            agg = A.aggregate_floorsheet(rows)
            store.write_floorsheet(target, agg)
            names = store.read_json("meta/brokers.json", {}) or {}
            names.update(A.broker_names(rows))
            store.write_json("meta/brokers.json", dict(sorted(names.items(), key=lambda kv: int(kv[0]))))
            print(f"floorsheet {target}: {len(rows)} trades -> {len(agg)} symbol/broker rows")
            changed = True

    catch_up_prices(store, src, latest_day, args.catchup, holidays)

    try:
        old = store.read_json("index/nepse.json", []) or []
        store.write_json("index/nepse.json", A.merge_index_history(old, A.index_history(src.index_history())))
    except Exception as e:
        print(f"warn: index history unavailable: {e}")

    if changed or args.rebuild:
        rebuild_derived(store)
    if not args.skip_issues:
        cmd_issues(args)
    store.update_manifest(lastEod=iso_now(), latestBusinessDay=latest_day)
    return 0


def cmd_backfill(args) -> int:
    from .fetch import NepseSource

    store = Store(args.data)
    src = NepseSource()
    today = to_npt(now_utc()).date()
    holidays = load_holidays(store, src, today.year) | load_holidays(store, src, today.year - 1)
    latest_day = str(src.status().get("asOf", ""))[:10]
    done = catch_up_prices(store, src, latest_day, args.days, holidays)
    print(f"backfilled {len(done)} day(s) of prices")
    return 0


def cmd_issues(args) -> int:
    from .fetch import sharesansar_issues

    store = Store(args.data)
    try:
        items = A.issues_doc(sharesansar_issues())
        store.write_json("issues.json", {"asOf": iso_now(), "source": "sharesansar.com", "items": items})
        print(f"issues: {len(items)}")
    except Exception as e:
        print(f"warn: issues unavailable: {e}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="nepse_lens", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    live = sub.add_parser("live")
    live.add_argument("--out", required=True)
    live.add_argument("--data", help="data dir with meta/holidays.json (optional)")
    live.add_argument("--force", action="store_true")
    live.set_defaults(fn=cmd_live)

    eod = sub.add_parser("eod")
    eod.add_argument("--data", required=True)
    eod.add_argument("--date", help="YYYY-MM-DD; defaults to NEPSE's latest business day")
    eod.add_argument("--catchup", type=int, default=10, help="trading days of prices to check for gaps")
    eod.add_argument("--force", action="store_true", help="re-download the floorsheet even if stored")
    eod.add_argument("--rebuild", action="store_true", help="rebuild accumulation files")
    eod.add_argument("--meta", action="store_true", help="refresh the securities list")
    eod.add_argument("--skip-issues", action="store_true")
    eod.set_defaults(fn=cmd_eod)

    bf = sub.add_parser("backfill-prices")
    bf.add_argument("--data", required=True)
    bf.add_argument("--days", type=int, default=250)
    bf.set_defaults(fn=cmd_backfill)

    iss = sub.add_parser("issues")
    iss.add_argument("--data", required=True)
    iss.set_defaults(fn=cmd_issues)

    args = p.parse_args(argv)
    t = time.monotonic()
    rc = args.fn(args)
    print(f"done in {time.monotonic() - t:.0f}s")
    return rc


if __name__ == "__main__":
    sys.exit(main())
