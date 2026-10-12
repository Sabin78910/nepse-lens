// Merge model for cross-device sync. Every watchlist symbol, alert and portfolio lot is an entry with
// the time it last changed; removals stay as tombstones so a deletion on one device wins over an older copy.

import type { Alert } from "./alerts";
import type { Txn } from "./portfolio";

export interface Entry<T> {
  at: number;
  del?: true;
  v?: T;
}

export interface SyncDoc {
  watch: Record<string, Entry<true>>;
  alerts: Record<string, Entry<Alert>>;
  txns: Record<string, Entry<Txn>>;
}

export interface Lists {
  watchlist: string[];
  alerts: Alert[];
  txns: Txn[];
}

export const emptyDoc = (): SyncDoc => ({ watch: {}, alerts: {}, txns: {} });

function reconcileMap<T>(map: Record<string, Entry<T>>, items: [string, T][], now: number): Record<string, Entry<T>> {
  let next = map;
  const set = (id: string, e: Entry<T>) => {
    if (next === map) next = { ...map };
    next[id] = e;
  };
  const seen = new Set<string>();
  for (const [id, v] of items) {
    seen.add(id);
    const cur = map[id];
    if (!cur || cur.del || JSON.stringify(cur.v) !== JSON.stringify(v)) set(id, { at: now, v });
  }
  for (const [id, cur] of Object.entries(map)) if (!cur.del && !seen.has(id)) set(id, { at: now, del: true });
  return next;
}

/** Records what changed locally since the last call. Returns the same object when nothing changed. */
export function reconcile(doc: SyncDoc, lists: Lists, now: number): SyncDoc {
  const watch = reconcileMap(doc.watch, lists.watchlist.map((s) => [s, true as const]), now);
  const alerts = reconcileMap(doc.alerts, lists.alerts.map((a) => [a.id, a]), now);
  const txns = reconcileMap(doc.txns, lists.txns.map((t) => [t.id, t]), now);
  return watch === doc.watch && alerts === doc.alerts && txns === doc.txns ? doc : { watch, alerts, txns };
}

function mergeMap<T>(a: Record<string, Entry<T>> = {}, b: Record<string, Entry<T>> = {}): Record<string, Entry<T>> {
  const out: Record<string, Entry<T>> = { ...a };
  for (const [id, e] of Object.entries(b)) {
    const cur = out[id];
    // newest wins; on a tie the deletion wins so both devices converge on the same answer
    if (!cur || e.at > cur.at || (e.at === cur.at && e.del && !cur.del)) out[id] = e;
  }
  return out;
}

export function mergeDocs(local: SyncDoc, remote: SyncDoc): SyncDoc {
  return {
    watch: mergeMap(local.watch, remote?.watch),
    alerts: mergeMap(local.alerts, remote?.alerts),
    txns: mergeMap(local.txns, remote?.txns),
  };
}

const live = <T>(m: Record<string, Entry<T>>) => Object.entries(m).filter(([, e]) => !e.del && e.v !== undefined);

export function materialize(doc: SyncDoc): Lists {
  return {
    watchlist: live(doc.watch).map(([s]) => s),
    alerts: live(doc.alerts).map(([, e]) => e.v!),
    txns: live(doc.txns).map(([, e]) => e.v!),
  };
}
