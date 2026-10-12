import { describe, expect, it } from "vitest";
import { POLL_MS, ageSeconds, diffTicks, shouldPoll, tween } from "./pulse";

describe("shouldPoll", () => {
  const ok = { phase: "open" as const, visible: true, online: true, mode: "live" as const };
  it("polls only when open, visible, online and live", () => {
    expect(shouldPoll(ok)).toBe(true);
    expect(shouldPoll({ ...ok, phase: "post" })).toBe(false);
    expect(shouldPoll({ ...ok, phase: "pre" })).toBe(false);
    expect(shouldPoll({ ...ok, visible: false })).toBe(false);
    expect(shouldPoll({ ...ok, online: false })).toBe(false);
    expect(shouldPoll({ ...ok, mode: "sample" })).toBe(false);
  });
  it("targets a 30 second cadence", () => expect(POLL_MS).toBe(30_000));
});

describe("diffTicks", () => {
  it("flags only changed prices with their direction", () => {
    const prev = [{ symbol: "A", ltp: 100 }, { symbol: "B", ltp: 50 }, { symbol: "C", ltp: 10 }];
    const next = [{ symbol: "A", ltp: 101 }, { symbol: "B", ltp: 49.5 }, { symbol: "C", ltp: 10 }, { symbol: "D", ltp: 5 }];
    expect(diffTicks(prev, next)).toEqual({ A: "up", B: "down" });
  });
  it("returns nothing without a previous snapshot", () => {
    expect(diffTicks([], [{ symbol: "A", ltp: 1 }])).toEqual({});
  });
});

describe("ageSeconds", () => {
  it("is whole seconds and never negative", () => {
    expect(ageSeconds("2026-01-01T00:00:00Z", new Date("2026-01-01T00:00:12.900Z"))).toBe(12);
    expect(ageSeconds("2026-01-01T00:00:10Z", new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("tween", () => {
  it("eases from start to end and lands exactly", () => {
    expect(tween(10, 20, 0)).toBe(10);
    expect(tween(10, 20, 1)).toBe(20);
    expect(tween(10, 20, 0.5)).toBeGreaterThan(10);
    expect(tween(10, 20, 2)).toBe(20);
  });
});
