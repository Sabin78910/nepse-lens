// Number formatting in the South Asian system (1,23,45,678) with lakh / crore / arba units,
// optional Devanagari digits for the Nepali UI.

export type Lang = "en" | "ne";

const DEVANAGARI = "०१२३४५६७८९";

export function toDevanagari(s: string): string {
  return s.replace(/[0-9]/g, (d) => DEVANAGARI[Number(d)]);
}

function localize(s: string, lang: Lang): string {
  return lang === "ne" ? toDevanagari(s) : s;
}

/** Groups an integer string as 1,23,45,678 (last 3 digits, then pairs). */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

/** 12345678.9 -> "1,23,45,678.90" */
export function formatNumber(n: number, decimals = 2, lang: Lang = "en"): string {
  if (!Number.isFinite(n)) return "—";
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, f] = fixed.split(".");
  const out = (neg ? "-" : "") + groupIndian(i) + (f ? "." + f : "");
  return localize(out, lang);
}

export function formatPrice(n: number | null | undefined, lang: Lang = "en"): string {
  return n == null ? "—" : formatNumber(n, 2, lang);
}

export function formatQty(n: number | null | undefined, lang: Lang = "en"): string {
  return n == null ? "—" : formatNumber(Math.round(n), 0, lang);
}

const UNITS: Record<Lang, { v: number; s: string }[]> = {
  en: [
    { v: 1e11, s: "Kharba" },
    { v: 1e9, s: "Arba" },
    { v: 1e7, s: "Cr" },
    { v: 1e5, s: "L" },
  ],
  ne: [
    { v: 1e11, s: "खर्ब" },
    { v: 1e9, s: "अर्ब" },
    { v: 1e7, s: "करोड" },
    { v: 1e5, s: "लाख" },
  ],
};

/** 4837723076 -> "4.84 Arba", 2550000 -> "25.50 L", 950 -> "950" */
export function formatCompact(n: number | null | undefined, lang: Lang = "en", decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  for (const u of UNITS[lang]) {
    if (abs >= u.v) return `${formatNumber(n / u.v, decimals, lang)} ${u.s}`;
  }
  return formatNumber(n, abs % 1 === 0 ? 0 : decimals, lang);
}

export function formatRs(n: number | null | undefined, lang: Lang = "en", compact = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const body = compact ? formatCompact(n, lang) : formatNumber(n, 2, lang);
  return (lang === "ne" ? "रु " : "Rs ") + body;
}

export type Direction = "up" | "down" | "flat";

export function direction(change: number | null | undefined): Direction {
  if (change == null || !Number.isFinite(change) || Math.abs(change) < 1e-9) return "flat";
  return change > 0 ? "up" : "down";
}

/** Arrow glyphs so gains and losses never rely on colour alone. */
export const ARROW: Record<Direction, string> = { up: "▲", down: "▼", flat: "■" };

export function formatPct(p: number | null | undefined, lang: Lang = "en"): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return localize(`${sign}${p.toFixed(2)}%`, lang);
}

export function formatChange(c: number | null | undefined, lang: Lang = "en"): string {
  if (c == null || !Number.isFinite(c)) return "—";
  return (c > 0 ? "+" : "") + formatNumber(c, 2, lang);
}

/** "2 min ago" style age labels for delayed data. */
export function ageLabel(fromIso: string, now: Date, lang: Lang = "en"): string {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (lang === "ne") {
    if (mins < 1) return "भर्खरै";
    if (mins < 60) return `${toDevanagari(String(mins))} मिनेट अघि`;
    const h = Math.round(mins / 60);
    if (h < 48) return `${toDevanagari(String(h))} घण्टा अघि`;
    return `${toDevanagari(String(Math.round(h / 24)))} दिन अघि`;
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
