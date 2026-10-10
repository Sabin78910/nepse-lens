// Optional Cloudflare Worker: an edge cache in front of the collector's JSON on GitHub.
//   GET /latest.json      -> live branch latest.json, cached 60 s
//   GET /data/<path>.json -> data branch file, cached 10 min
// Set VITE_API_URL to this Worker's URL when building the app to use it.

const RAW = "https://raw.githubusercontent.com/Sabin78910/nepse-lens";

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function upstream(pathname: string): { url: string; ttl: number } | null {
  if (pathname === "/latest.json") return { url: `${RAW}/live/latest.json`, ttl: 60 };
  const m = /^\/data\/([A-Za-z0-9_./-]+\.json)$/.exec(pathname);
  if (m && !m[1].includes("..")) return { url: `${RAW}/data/${m[1]}`, ttl: 600 };
  return null;
}

export default {
  async fetch(req: Request, _env: unknown, ctx: Ctx): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });
    const target = upstream(new URL(req.url).pathname);
    if (!target) return new Response("Not found", { status: 404, headers: CORS });
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(target.url);
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(`${target.url}?t=${Date.now()}`, { headers: { "User-Agent": "nepse-lens-worker" } });
    if (!res.ok) return new Response(res.statusText, { status: res.status, headers: CORS });
    const out = new Response(res.body, {
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${target.ttl}` },
    });
    ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  },
};
