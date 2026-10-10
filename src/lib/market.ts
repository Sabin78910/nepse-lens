// NEPSE market clock: 11:00-15:00 Nepal time (UTC+5:45), minus holidays. The trading week moved from
// Sunday-Thursday to Monday-Friday in April 2026 (per NEPSE's index history).

export const NPT_OFFSET_MIN = 345;
export const OPEN_MIN = 11 * 60;
export const CLOSE_MIN = 15 * 60;
const OLD_WEEK = new Set([0, 1, 2, 3, 4]); // Sun..Thu (getUTCDay)
const NEW_WEEK = new Set([1, 2, 3, 4, 5]); // Mon..Fri
export const WEEK_SWITCH = "2026-04-06";

/** A Date whose UTC fields read as Nepal wall-clock time. */
function nptClock(now: Date): Date {
  return new Date(now.getTime() + NPT_OFFSET_MIN * 60000);
}

export function nptDateString(now: Date): string {
  return nptClock(now).toISOString().slice(0, 10);
}

export function isTradingDay(isoDate: string, holidays: Set<string>): boolean {
  const d = new Date(isoDate + "T00:00:00Z");
  return (isoDate >= WEEK_SWITCH ? NEW_WEEK : OLD_WEEK).has(d.getUTCDay()) && !holidays.has(isoDate);
}

export type Phase = "open" | "pre" | "post" | "closed";

export interface MarketClock {
  phase: Phase;
  /** Next open or close instant (UTC ms). */
  next: number;
  nextKind: "open" | "close";
}

function nptInstant(isoDate: string, minutes: number): number {
  return Date.parse(isoDate + "T00:00:00Z") + (minutes - NPT_OFFSET_MIN) * 60000;
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function marketClock(now: Date, holidays: Set<string> = new Set()): MarketClock {
  const clock = nptClock(now);
  const today = clock.toISOString().slice(0, 10);
  const mins = clock.getUTCHours() * 60 + clock.getUTCMinutes();
  if (isTradingDay(today, holidays)) {
    if (mins < OPEN_MIN) return { phase: "pre", next: nptInstant(today, OPEN_MIN), nextKind: "open" };
    if (mins < CLOSE_MIN) return { phase: "open", next: nptInstant(today, CLOSE_MIN), nextKind: "close" };
  }
  let d = addDays(today, 1);
  for (let i = 0; i < 60 && !isTradingDay(d, holidays); i++) d = addDays(d, 1);
  const phase: Phase = isTradingDay(today, holidays) ? "post" : "closed";
  return { phase, next: nptInstant(d, OPEN_MIN), nextKind: "open" };
}

/** 9030000 ms -> "2h 30m", 59000 -> "59s" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
