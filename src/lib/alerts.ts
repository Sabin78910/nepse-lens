// Price alerts evaluated on each data refresh. Alerts fire once when the condition becomes true
// (crossing), then stay quiet until re-armed, so a price sitting above a level does not spam.

export type AlertKind = "above" | "below" | "pctUp" | "pctDown";

export interface Alert {
  id: string;
  symbol: string;
  kind: AlertKind;
  value: number;
  active: boolean;
  firedAt?: string;
}

export interface Quote {
  ltp: number;
  pct: number;
}

export function conditionMet(a: Alert, q: Quote): boolean {
  switch (a.kind) {
    case "above":
      return q.ltp >= a.value;
    case "below":
      return q.ltp <= a.value;
    case "pctUp":
      return q.pct >= a.value;
    case "pctDown":
      return q.pct <= -Math.abs(a.value);
  }
}

export function describeAlert(a: Alert): string {
  switch (a.kind) {
    case "above":
      return `${a.symbol} at or above Rs ${a.value}`;
    case "below":
      return `${a.symbol} at or below Rs ${a.value}`;
    case "pctUp":
      return `${a.symbol} up ${a.value}% or more today`;
    case "pctDown":
      return `${a.symbol} down ${Math.abs(a.value)}% or more today`;
  }
}

/** Returns the alerts that fire now and the updated alert list (fired alerts are disarmed). */
export function evaluateAlerts(alerts: Alert[], quotes: Map<string, Quote>, nowIso: string): { fired: Alert[]; next: Alert[] } {
  const fired: Alert[] = [];
  const next = alerts.map((a) => {
    const q = quotes.get(a.symbol);
    if (!a.active || !q || !conditionMet(a, q)) return a;
    const done = { ...a, active: false, firedAt: nowIso };
    fired.push(done);
    return done;
  });
  return { fired, next };
}

export function validateAlert(kind: AlertKind, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return "Enter a positive number";
  if ((kind === "pctUp" || kind === "pctDown") && value > 10) return "NEPSE limits daily moves to 10%";
  return null;
}

export function newAlert(symbol: string, kind: AlertKind, value: number, id = Math.random().toString(36).slice(2, 10)): Alert {
  return { id, symbol: symbol.toUpperCase(), kind, value, active: true };
}
