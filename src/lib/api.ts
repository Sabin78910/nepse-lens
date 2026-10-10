// Where data comes from, in order of preference:
//  1. VITE_API_URL (optional Cloudflare Worker cache): `${API}/latest.json` and `${API}/data/<path>`
//  2. Static JSON written by the GitHub Actions collector: `live` branch (latest.json) and `data` branch (history)
//  3. The recorded real sample bundled with the app (clearly labelled as a sample in the UI)

export const REPO_RAW = "https://raw.githubusercontent.com/Sabin78910/nepse-lens";

export interface Sources {
  latest: string;
  data: (path: string) => string;
  sample: (path: string) => string;
}

export function sources(apiUrl: string | undefined, base = "./"): Sources {
  const api = apiUrl?.replace(/\/+$/, "");
  return {
    latest: api ? `${api}/latest.json` : `${REPO_RAW}/live/latest.json`,
    data: (p) => (api ? `${api}/data/${p}` : `${REPO_RAW}/data/${p}`),
    sample: (p) => `${base}sample/${p}`,
  };
}

export type Mode = "live" | "sample";

type Fetcher = (url: string) => Promise<Response>;

export async function getJson<T>(url: string, fetcher: Fetcher = fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/**
 * Loads `latest.json`, deciding the mode for the whole session: if the live snapshot cannot be read
 * (no network, or the collector has not published yet) the app switches to the bundled sample.
 */
export async function loadLatest<T>(src: Sources, validate: (x: unknown) => x is T, fetcher: Fetcher = fetch): Promise<{ mode: Mode; latest: T }> {
  try {
    const x = await getJson<unknown>(src.latest + `?t=${Math.floor(Date.now() / 60000)}`, fetcher);
    if (validate(x)) return { mode: "live", latest: x };
  } catch {
    // fall through to the sample
  }
  const s = await getJson<unknown>(src.sample("latest.json"), fetcher);
  if (!validate(s)) throw new Error("Bundled sample is invalid");
  return { mode: "sample", latest: s };
}

/** History files follow the session mode; a missing file (e.g. a stock never traded) resolves to null. */
export async function loadData<T>(src: Sources, mode: Mode, path: string, fetcher: Fetcher = fetch): Promise<T | null> {
  const url = mode === "live" ? src.data(path) : src.sample(path);
  try {
    return await getJson<T>(url, fetcher);
  } catch {
    return null;
  }
}
