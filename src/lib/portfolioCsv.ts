// Pure CSV/JSON export and CSV import for portfolio transactions.

import type { Txn } from "./portfolio";

export const HEADER = ["Symbol", "Side", "Qty", "Price", "Date"];

export interface CsvError {
  line: number;
  message: string;
}

export interface ParseResult {
  txns: Txn[];
  errors: CsvError[];
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(txns: Txn[]): string {
  const rows = txns.map((t) => [t.symbol, t.side, t.qty, t.price, t.date].map(esc).join(","));
  return [HEADER.join(","), ...rows].join("\n") + "\n";
}

export function toJson(txns: Txn[]): string {
  return JSON.stringify(txns, null, 2);
}

/** Split CSV text into rows of fields, honouring quotes (including quoted newlines). Returns the 1-based start line of each row. */
function rows(text: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = "";
  let q = false;
  let line = 1;
  let start = 1;
  const endRow = () => {
    cells.push(cur);
    if (cells.some((c) => c.trim() !== "")) out.push({ line: start, cells });
    cells = [];
    cur = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else {
        cur += c;
        if (c === "\n") line++;
      }
    } else if (c === '"') q = true;
    else if (c === ",") {
      cells.push(cur);
      cur = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      start = line;
    } else cur += c;
  }
  if (cur !== "" || cells.length) endRow();
  return out;
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "").trim()));

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Parse a Symbol,Side,Qty,Price,Date CSV. Bad rows are reported by line number; good rows are kept. */
export function parseCsv(text: string, known?: Set<string>): ParseResult {
  const all = rows((text.charCodeAt(0) === 0xfeff ? text.slice(1) : text));
  const txns: Txn[] = [];
  const errors: CsvError[] = [];
  const head = all[0]?.cells.map((c) => c.trim().toLowerCase());
  if (!head || HEADER.some((h, i) => head[i] !== h.toLowerCase())) {
    return { txns, errors: [{ line: all[0]?.line ?? 1, message: `Header must be ${HEADER.join(",")}` }] };
  }
  all.slice(1).forEach(({ line, cells }, n) => {
    const fail = (message: string) => errors.push({ line, message });
    if (cells.length < 5) return fail("Expected 5 columns");
    const symbol = cells[0].trim().toUpperCase();
    const side = cells[1].trim().toLowerCase();
    const qty = num(cells[2]);
    const price = num(cells[3]);
    const date = cells[4].trim();
    if (!symbol) return fail("Missing symbol");
    if (known && !known.has(symbol)) return fail(`Unknown symbol ${symbol}`);
    if (side !== "buy" && side !== "sell" && side !== "bonus") return fail("Side must be buy, sell or bonus");
    if (!(qty > 0) || !Number.isInteger(qty)) return fail("Quantity must be a whole number");
    if (side !== "bonus" && !(price > 0)) return fail("Price must be greater than zero");
    if (!validDate(date)) return fail("Date must be YYYY-MM-DD");
    txns.push({ id: `imp${Date.now().toString(36)}${n}`, symbol, side, qty, price: side === "bonus" ? 0 : price, date });
  });
  return { txns, errors };
}

const key = (t: Txn) => [t.symbol, t.side, t.qty, t.price, t.date].join("|");

/** Skip incoming rows identical (symbol/side/qty/price/date) to existing rows or to earlier incoming rows. */
export function dedupe(existing: Txn[], incoming: Txn[]): { added: Txn[]; duplicates: number } {
  const seen = new Set(existing.map(key));
  const added: Txn[] = [];
  for (const t of incoming) {
    if (seen.has(key(t))) continue;
    seen.add(key(t));
    added.push(t);
  }
  return { added, duplicates: incoming.length - added.length };
}
