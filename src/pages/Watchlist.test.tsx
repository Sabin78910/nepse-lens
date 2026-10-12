import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Watchlist from "./Watchlist";
import { Ctx, makeTr, type AppState } from "../components/ui";
import type { Stock } from "../lib/data";

vi.mock("../lib/watchlist", async (orig) => ({ ...(await orig<typeof import("../lib/watchlist")>()), loadSparkline: vi.fn(async () => [1, 2, 3]) }));

const mk = (symbol: string, pct: number): Stock => ({
  symbol, name: symbol, sector: "Others", ltp: 100, pct, change: 0, prevClose: 100, open: null, high: null, low: null, qty: 1, turnover: 1,
});

function setup(list = ["AAA", "BBB", "CCC"]) {
  const setWatchlist = vi.fn();
  const state = {
    data: { mode: "sample", stocks: [mk("AAA", -1), mk("BBB", 2), mk("CCC", 0.5)] },
    lang: "en", tr: makeTr("en"), go: vi.fn(), watchlist: list, toggleWatch: vi.fn(), setWatchlist,
    alerts: [], setAlerts: vi.fn(), txns: [], setTxns: vi.fn(),
  } as unknown as AppState;
  render(<Ctx.Provider value={state}><Watchlist /></Ctx.Provider>);
  return { setWatchlist };
}
const order = () => screen.getAllByRole("button", { name: /^(AAA|BBB|CCC)/ }).map((b) => b.textContent?.slice(0, 3));

describe("Watchlist page", () => {
  beforeEach(() => localStorage.clear());

  it("moves an item down with the keyboard-accessible button", async () => {
    const { setWatchlist } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Move down: AAA" }));
    expect(setWatchlist).toHaveBeenCalledWith(["BBB", "AAA", "CCC"]);
    expect(screen.getByRole("button", { name: "Move up: AAA" })).toBeDisabled();
  });

  it("sorts by change, persists the choice and hides reorder buttons", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Change %" }));
    expect(order()).toEqual(["BBB", "CCC", "AAA"]);
    expect(JSON.parse(localStorage.getItem("nl.watchSort")!)).toBe("change");
    expect(screen.queryByRole("button", { name: /Move up/ })).toBeNull();
  });

  it("restores the saved sort", () => {
    localStorage.setItem("nl.watchSort", JSON.stringify("name"));
    setup(["CCC", "AAA", "BBB"]);
    expect(screen.getByRole("radio", { name: "A-Z" })).toBeChecked();
    expect(order()).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("renders a sparkline per stock", async () => {
    setup();
    expect(await screen.findAllByRole("img", { name: /30-day trend/ })).toHaveLength(3);
  });
});
