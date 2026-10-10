"""Nepal market calendar helpers (pure, no I/O).

NEPSE trades 11:00-15:00 Nepal time (UTC+5:45), except public holidays. The trading week moved from
Sunday-Thursday to Monday-Friday in April 2026 (last Sunday session 2026-04-05, first Friday 2026-04-10,
per NEPSE's own index history).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

NPT = timezone(timedelta(hours=5, minutes=45), "NPT")
OPEN = time(11, 0)
CLOSE = time(15, 0)
# Python weekday(): Monday=0 ... Sunday=6.
OLD_WEEK = {6, 0, 1, 2, 3}  # Sun-Thu
NEW_WEEK = {0, 1, 2, 3, 4}  # Mon-Fri
WEEK_SWITCH = date(2026, 4, 6)


def trading_weekdays(d: date) -> set[int]:
    return NEW_WEEK if d >= WEEK_SWITCH else OLD_WEEK


def to_npt(now: datetime) -> datetime:
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(NPT)


def is_trading_day(d: date, holidays: set[str] | frozenset[str] = frozenset()) -> bool:
    return d.weekday() in trading_weekdays(d) and d.isoformat() not in holidays


def phase(now: datetime, holidays: set[str] | frozenset[str] = frozenset()) -> str:
    """Return 'pre', 'open', 'post' on a trading day, or 'holiday' otherwise."""
    local = to_npt(now)
    if not is_trading_day(local.date(), holidays):
        return "holiday"
    t = local.time()
    if t < OPEN:
        return "pre"
    if t < CLOSE:
        return "open"
    return "post"


def should_run_live(now: datetime, holidays: set[str] | frozenset[str] = frozenset()) -> bool:
    """Live snapshots run from 5 minutes before the open until 10 minutes after the close."""
    local = to_npt(now)
    if not is_trading_day(local.date(), holidays):
        return False
    t = local.time()
    return time(10, 55) <= t <= time(15, 10)


def recent_trading_days(
    today: date, count: int, holidays: set[str] | frozenset[str] = frozenset()
) -> list[date]:
    """The last `count` trading days up to and including `today`, newest first."""
    out: list[date] = []
    d = today
    # Bounded walk: even with long festival closures 4x the count is plenty.
    for _ in range(count * 4 + 30):
        if is_trading_day(d, holidays):
            out.append(d)
            if len(out) == count:
                break
        d -= timedelta(days=1)
    return out


def missing_days(wanted: list[date], have: set[str]) -> list[date]:
    """Days from `wanted` that are not yet stored, oldest first (so history fills in order)."""
    return sorted(d for d in wanted if d.isoformat() not in have)
