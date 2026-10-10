from datetime import date, datetime, timezone

import pytest

from nepse_lens import aggregate as A
from nepse_lens.market import is_trading_day, missing_days, phase, recent_trading_days, should_run_live
from nepse_lens.store import Store


def trade(cid, sym, buyer, seller, qty, rate):
    return {"contractId": cid, "stockSymbol": sym, "buyerMemberId": str(buyer), "sellerMemberId": str(seller),
            "contractQuantity": qty, "contractRate": rate, "contractAmount": qty * rate,
            "buyerBrokerName": f"B{buyer}", "sellerBrokerName": f"B{seller}", "businessDate": "2026-10-09"}


ROWS = [trade(1, "NABIL", 58, 34, 100, 500), trade(2, "NABIL", 58, 45, 50, 502), trade(3, "NABIL", 34, 58, 20, 501),
        trade(4, "HDL", 45, 58, 10, 1000)]


# ---------- market calendar ----------
def utc(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=timezone.utc)


def test_trading_week_is_monday_to_friday_since_april_2026():
    assert is_trading_day(date(2026, 10, 12))  # Monday
    assert is_trading_day(date(2026, 10, 9))  # Friday
    assert not is_trading_day(date(2026, 10, 11))  # Sunday
    assert not is_trading_day(date(2026, 10, 10))  # Saturday


def test_trading_week_was_sunday_to_thursday_before():
    assert is_trading_day(date(2026, 4, 5))  # Sunday
    assert not is_trading_day(date(2026, 4, 3))  # Friday


def test_holidays_close_the_market():
    assert not is_trading_day(date(2026, 10, 12), {"2026-10-12"})


def test_phase_uses_nepal_time():
    # 05:15 UTC == 11:00 NPT on Monday 12 Oct 2026
    assert phase(utc(2026, 10, 12, 5, 14)) == "pre"
    assert phase(utc(2026, 10, 12, 5, 15)) == "open"
    assert phase(utc(2026, 10, 12, 9, 15)) == "post"
    assert phase(utc(2026, 10, 10, 6, 0)) == "holiday"


def test_phase_rejects_naive_datetimes():
    with pytest.raises(ValueError):
        phase(datetime(2026, 10, 11, 6, 0))


def test_live_window_has_margins():
    assert should_run_live(utc(2026, 10, 12, 5, 10))  # 10:55 NPT
    assert not should_run_live(utc(2026, 10, 12, 5, 0))  # 10:45 NPT
    assert should_run_live(utc(2026, 10, 12, 9, 25))  # 15:10 NPT
    assert not should_run_live(utc(2026, 10, 12, 9, 30))


def test_recent_trading_days_skips_weekend_and_holidays():
    days = recent_trading_days(date(2026, 10, 12), 3, {"2026-10-08"})
    assert days == [date(2026, 10, 12), date(2026, 10, 9), date(2026, 10, 7)]


def test_missing_days_are_oldest_first():
    want = [date(2026, 10, 11), date(2026, 10, 8), date(2026, 10, 7)]
    assert missing_days(want, {"2026-10-08"}) == [date(2026, 10, 7), date(2026, 10, 11)]


# ---------- floorsheet aggregation ----------
def test_aggregate_buy_and_sell_sides():
    agg = A.aggregate_floorsheet(ROWS)
    assert agg[("NABIL", 58)] == [150, 20, 100 * 500 + 50 * 502, 20 * 501]
    assert agg[("NABIL", 34)] == [20, 100, 20 * 501, 100 * 500]
    assert agg[("HDL", 58)] == [0, 10, 0, 10000]


def test_aggregate_dedupes_contract_ids():
    agg = A.aggregate_floorsheet(ROWS + [ROWS[0]])
    assert agg[("NABIL", 58)][0] == 150


def test_aggregate_skips_bad_rows():
    bad = [{"contractId": 9, "stockSymbol": "", "buyerMemberId": "1", "sellerMemberId": "2"},
           {"contractId": 10, "stockSymbol": "X", "buyerMemberId": None, "sellerMemberId": "2"}]
    assert A.aggregate_floorsheet(bad) == {}


def test_total_buy_equals_total_sell():
    agg = A.aggregate_floorsheet(ROWS)
    assert sum(v[0] for v in agg.values()) == sum(v[1] for v in agg.values())
    assert sum(v[2] for v in agg.values()) == pytest.approx(sum(v[3] for v in agg.values()))


def test_csv_round_trip():
    agg = A.aggregate_floorsheet(ROWS)
    assert A.agg_from_csv(A.agg_to_csv(agg)) == agg


def test_broker_names():
    assert A.broker_names(ROWS) == {"34": "B34", "45": "B45", "58": "B58"}


def test_accum_docs_index_only_dates_with_trades():
    d1 = A.aggregate_floorsheet(ROWS)
    d2 = A.aggregate_floorsheet([trade(5, "NABIL", 45, 58, 5, 510)])
    docs = A.accum_docs({"2026-10-08": d1, "2026-10-09": d2})
    assert docs["HDL"]["dates"] == ["2026-10-08"]
    assert docs["NABIL"]["dates"] == ["2026-10-08", "2026-10-09"]
    assert [0, 58, 150, 20, 75100, 10020] in docs["NABIL"]["r"]
    assert [1, 45, 5, 0, 2550, 0] in docs["NABIL"]["r"]


def test_window_dates():
    ds = [f"2026-09-{i:02d}" for i in range(1, 11)]
    assert A.window_dates(ds, "1D") == ["2026-09-10"]
    assert len(A.window_dates(ds, "1W")) == 5
    assert A.window_dates(ds, "ALL") == ds


def test_broker_summary_top_net_buys_and_sells():
    s = A.broker_summary({"2026-10-09": A.aggregate_floorsheet(ROWS)})
    b58 = s["windows"]["1D"]["brokers"]["58"]
    assert b58["buys"][0][0] == "NABIL" and b58["buys"][0][1] == 130
    assert b58["sells"][0] == ["HDL", -10, -10000]
    assert s["asOf"] == "2026-10-09"


def test_broker_summary_window_limits_days():
    old = A.aggregate_floorsheet([trade(7, "NABIL", 58, 34, 1000, 500)])
    new = A.aggregate_floorsheet(ROWS)
    s = A.broker_summary({"2026-10-08": old, "2026-10-09": new})
    assert s["windows"]["1D"]["brokers"]["58"]["buys"][0][1] == 130
    assert s["windows"]["1W"]["brokers"]["58"]["buys"][0][1] == 1130


# ---------- prices / index / latest ----------
TP = [{"symbol": "NABIL", "businessDate": "2026-10-09", "openPrice": 530, "highPrice": 538, "lowPrice": 531,
       "closePrice": 536.2, "totalTradedQuantity": 48779, "totalTradedValue": 26163739.6}]


def test_price_rows_and_upsert_are_idempotent():
    row = A.price_rows(TP)["NABIL"]
    assert row == ["2026-10-09", 530, 538, 531, 536.2, 48779, 26163739.6]
    doc = A.upsert_price(None, "NABIL", row)
    doc = A.upsert_price(doc, "NABIL", row)
    doc = A.upsert_price(doc, "NABIL", ["2026-10-08", 1, 1, 1, 1, 1, 1])
    assert [r[0] for r in doc["d"]] == ["2026-10-08", "2026-10-09"]


def test_price_rows_skip_rows_without_close():
    assert A.price_rows([{"symbol": "X", "businessDate": "2026-10-09"}]) == {}


def test_index_history_sorted_and_merged():
    content = [{"businessDate": "2026-10-09", "openIndex": 2578.2, "highIndex": 2591.85, "lowIndex": 2569.08,
                "closingIndex": 2591.8, "turnoverValue": 1},
               {"businessDate": "2026-10-08", "openIndex": 1, "highIndex": 1, "lowIndex": 1, "closingIndex": 2574.65,
                "turnoverValue": 1}]
    h = A.index_history(content)
    assert [r[0] for r in h] == ["2026-10-08", "2026-10-09"]
    merged = A.merge_index_history([["2026-10-01", 1, 1, 1, 2500, 1], ["2026-10-08", 0, 0, 0, 0, 0]], h)
    assert [r[0] for r in merged] == ["2026-10-01", "2026-10-08", "2026-10-09"]
    assert merged[1][4] == 2574.65


def test_index_doc_derives_previous_close_from_change():
    d = A.index_doc({"id": 58, "index": "NEPSE Index", "currentValue": 2591.8, "change": 17.15, "perChange": 0.66,
                     "close": 2574.65, "previousClose": 2591.8})
    assert d["prev"] == 2574.65 and d["value"] == 2591.8


def test_summary_doc_maps_labels():
    s = A.summary_doc([{"detail": "Total Turnover Rs:", "value": 4837723076.79}, {"detail": "Unknown", "value": 1}])
    assert s == {"turnover": 4837723076.79}


def test_stock_rows_merge_live_over_price_volume():
    pv = [{"symbol": "A", "lastTradedPrice": 100, "previousClose": 98, "percentageChange": 2.0408, "totalTradeQuantity": 5},
          {"symbol": "B", "lastTradedPrice": 50, "previousClose": 50, "percentageChange": 0, "totalTradeQuantity": 0}]
    live = [{"symbol": "A", "lastTradedPrice": 110, "previousClose": 100, "openPrice": 101, "highPrice": 111,
             "lowPrice": 99, "totalTradeQuantity": 9, "totalTradeValue": 990, "lastUpdatedDateTime": "t"}]
    rows = A.stock_rows(live, pv)
    assert rows[0] == ["A", 110, 10.0, 100, 101, 111, 99, 9, 990, "t"]
    assert rows[1][0] == "B" and rows[1][2] == 0


def test_latest_doc_shape():
    doc = A.latest_doc(fetched_at="t", status={"isOpen": "CLOSE", "asOf": "2026-10-09T15:00:00", "id": 80},
                       summary=[], indices=[], subindices=[], live=[], price_volume=[], intraday=[[1, 2.5]])
    assert doc["v"] == 1 and doc["status"] == {"isOpen": "CLOSE", "asOf": "2026-10-09T15:00:00"}
    assert doc["intraday"] == [[1, 2.5]]


def test_securities_doc_drops_contact_details():
    companies = [{"symbol": "NABIL", "sectorName": "Commercial Banks", "companyEmail": "x@y.z", "website": "w"}]
    secs = [{"id": 131, "symbol": "NABIL", "securityName": "Nabil Bank Limited", "activeStatus": "A"},
            {"id": 9, "symbol": "NABILP", "securityName": "Nabil Promoter", "activeStatus": "A"},
            {"id": 8, "symbol": "OLD", "securityName": "Gone", "activeStatus": "D"}]
    doc = A.securities_doc(companies, secs)
    assert doc == [{"s": "NABIL", "n": "Nabil Bank Limited", "sec": "Commercial Banks", "id": 131},
                   {"s": "NABILP", "n": "Nabil Promoter", "sec": "Promoter Share", "id": 9}]
    assert "@" not in str(doc)


def test_issues_doc_strips_html_and_orders_open_first():
    rows = {1: [{"company": {"symbol": "<a href='x'>HPHL</a>", "companyname": "<a>Him &amp; Co</a>"},
                 "total_units": "5915000.00", "issue_price": "100.00", "opening_date": "", "closing_date": "",
                 "status": -2, "issue_manager": "Citizens Capital"},
                {"company": {"symbol": "BENI", "companyname": "Beni"}, "total_units": "10", "issue_price": "100",
                 "opening_date": "2026-10-09", "closing_date": "2026-10-12", "status": 0, "issue_manager": ""}]}
    doc = A.issues_doc(rows)
    assert doc[0]["symbol"] == "BENI" and doc[0]["status"] == "open" and doc[0]["manager"] is None
    assert doc[1] == {"type": "IPO", "symbol": "HPHL", "company": "Him & Co", "units": 5915000, "price": 100,
                      "open": None, "close": None, "status": "upcoming", "manager": "Citizens Capital"}


# ---------- store ----------
def test_store_floorsheet_round_trip_is_byte_stable(tmp_path):
    st = Store(tmp_path)
    agg = A.aggregate_floorsheet(ROWS)
    st.write_floorsheet("2026-10-09", agg)
    first = st.path(st.floorsheet_rel("2026-10-09")).read_bytes()
    st.write_floorsheet("2026-10-09", agg)
    assert st.path(st.floorsheet_rel("2026-10-09")).read_bytes() == first
    assert st.has_floorsheet("2026-10-09") and st.floorsheet_days() == ["2026-10-09"]
    assert st.load_daily()["2026-10-09"] == agg


def test_store_manifest_tracks_days(tmp_path):
    st = Store(tmp_path)
    st.write_floorsheet("2026-10-08", {})
    m = st.update_manifest(lastEod="t")
    assert m["floorsheetDays"] == ["2026-10-08"] and m["firstFloorsheetDay"] == "2026-10-08"
    assert st.read_json("manifest.json")["lastEod"] == "t"
    assert st.read_json("missing.json", 7) == 7
