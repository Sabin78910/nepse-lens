// Live market pulse: when to poll, which prices ticked, and how fresh the data is.
import type { Phase } from "./market";

export const POLL_MS = 30_000;
export const FLASH_MS = 400;

export interface PollState {
  phase: Phase;
  visible: boolean;
  online: boolean;
  mode: "live" | "sample";
}

/** Poll only while the market is open, the tab is visible, the device is online and data is live. */
export function shouldPoll(s: PollState): boolean {
  return s.phase === "open" && s.visible && s.online && s.mode === "live";
}

export type Tick = "up" | "down";

/** Symbols whose last traded price changed between two snapshots. */
export function diffTicks(prev: { symbol: string; ltp: number }[], next: { symbol: string; ltp: number }[]): Record<string, Tick> {
  const before = new Map(prev.map((s) => [s.symbol, s.ltp]));
  const out: Record<string, Tick> = {};
  for (const s of next) {
    const p = before.get(s.symbol);
    if (p !== undefined && p !== s.ltp) out[s.symbol] = s.ltp > p ? "up" : "down";
  }
  return out;
}

export function ageSeconds(fetchedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(fetchedAt)) / 1000));
}

/** Ease-out interpolation; t is clamped to 0..1. */
export function tween(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return from + (to - from) * (1 - (1 - k) * (1 - k));
}
