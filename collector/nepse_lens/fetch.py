"""Network access. Uses the open-source NepseUnofficialApi wrapper for nepalstock.com's token handshake.

Politeness: one request at a time with a pause between requests, and callers cache results on disk.
"""

from __future__ import annotations

import time
from typing import Any, Callable

import httpx

DELAY = 1.2  # seconds between requests to the same host
UA = "NEPSE-Lens-collector/1.0 (+https://github.com/Sabin78910/nepse-lens)"


class NepseSource:
    def __init__(self, delay: float = DELAY):
        from nepse import Nepse  # imported lazily so unit tests never need the network package

        self.n = Nepse()
        # nepalstock.com has served an incomplete TLS chain for years; the wrapper documents this switch.
        self.n.setTLSVerification(False)
        self.delay = delay
        self._last = 0.0

    def _pace(self) -> None:
        wait = self._last + self.delay - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def _call(self, fn: Callable[[], Any], tries: int = 3) -> Any:
        err: Exception | None = None
        for attempt in range(tries):
            self._pace()
            try:
                return fn()
            except Exception as e:  # the wrapper raises its own error classes
                err = e
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"NEPSE request failed after {tries} tries: {err!r}")

    def get(self, url: str) -> Any:
        return self._call(lambda: self.n.requestGETAPI(url=url))

    def post(self, url: str, floorsheet_payload: bool = False) -> Any:
        gen = self.n.getPOSTPayloadIDForFloorSheet if floorsheet_payload else self.n.getPOSTPayloadID
        return self._call(lambda: self.n.requestPOSTAPI(url=url, payload_generator=gen))

    # ---- GET endpoints ----
    def status(self) -> dict[str, Any]:
        return self.get("/api/nots/nepse-data/market-open")

    def summary(self) -> list[dict[str, Any]]:
        return self.get("/api/nots/market-summary/")

    def indices(self) -> list[dict[str, Any]]:
        return self.get("/api/nots/nepse-index")

    def subindices(self) -> list[dict[str, Any]]:
        return self.get("/api/nots")

    def live(self) -> list[dict[str, Any]]:
        return self.get("/api/nots/lives-market")

    def price_volume(self) -> list[dict[str, Any]]:
        return self.get("/api/nots/securityDailyTradeStat/58")

    def companies(self) -> list[dict[str, Any]]:
        return self.get("/api/nots/company/list")

    def securities(self) -> list[dict[str, Any]]:
        return self.get("/api/nots/security?nonDelisted=true")

    def holidays(self, year: int) -> list[dict[str, Any]]:
        return self.get(f"/api/nots/holiday/list?year={year}")

    def index_history(self, index_id: int = 58, size: int = 500) -> list[dict[str, Any]]:
        d = self.get(f"/api/nots/index/history/{index_id}?size={size}&page=0")
        return d.get("content", []) if isinstance(d, dict) else []

    # ---- POST endpoints (need the payload id dance) ----
    def intraday(self) -> list[list[Any]]:
        return self.post("/api/nots/graph/index/58")

    def today_price(self, day: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        page = 0
        while True:
            d = self.post(f"/api/nots/nepse-data/today-price?&size=500&businessDate={day}&page={page}", True)
            rows.extend(d.get("content", []))
            if page + 1 >= int(d.get("totalPages", 1) or 1):
                return rows
            page += 1

    def floorsheet(self, progress: bool = True) -> list[dict[str, Any]]:
        """The whole floorsheet of the LATEST business day (NEPSE does not serve older days)."""
        base = "/api/nots/nepse-data/floorsheet?&size=500&sort=contractId,desc"
        first = self.post(f"{base}&page=0", True)["floorsheets"]
        rows = list(first["content"])
        pages = int(first["totalPages"])
        for p in range(1, pages):
            sheet = self.post(f"{base}&page={p}", True)["floorsheets"]
            rows.extend(sheet["content"])
            if progress and p % 10 == 0:
                print(f"  floorsheet page {p + 1}/{pages}", flush=True)
        return rows


def sharesansar_issues(types: tuple[int, ...] = (1, 2, 3, 5), per_type: int = 15) -> dict[int, list[dict[str, Any]]]:
    """IPO / FPO / right-share issues from ShareSansar's public table (robots.txt allows all)."""
    out: dict[int, list[dict[str, Any]]] = {}
    with httpx.Client(timeout=30, headers={"User-Agent": UA}, follow_redirects=True) as c:
        c.get("https://www.sharesansar.com/existing-issues")
        for t in types:
            time.sleep(DELAY)
            r = c.get(
                "https://www.sharesansar.com/existing-issues",
                params={"type": t, "draw": 1, "start": 0, "length": per_type},
                headers={"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"},
            )
            r.raise_for_status()
            out[t] = r.json().get("data", [])
    return out
