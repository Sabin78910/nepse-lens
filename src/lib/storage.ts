// Small, defensive localStorage helpers: bad or missing data falls back to the default.

export function load<T>(key: string, fallback: T, store: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): T {
  try {
    const raw = store?.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw) as T;
    if (Array.isArray(fallback) !== Array.isArray(v)) return fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown, store: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the app keeps working for this session
  }
}

export function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export const KEYS = {
  watchlist: "nl.watchlist",
  alerts: "nl.alerts",
  txns: "nl.txns",
  lang: "nl.lang",
  theme: "nl.theme",
} as const;
