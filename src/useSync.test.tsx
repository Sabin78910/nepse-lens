import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SYNC_CODE_KEY, useSync, type SyncApi } from "./useSync";
import { newSyncCode } from "./sync";
import SyncCard from "./components/SyncCard";
import { Ctx, makeTr, type AppState } from "./components/ui";

const lists = { watchlist: ["NABIL"], alerts: [], txns: [] };

function fakeFactory(remote: unknown = null) {
  const sync = vi.fn(async (local: never, _v: number, merge: (a: never, b: never) => unknown) => ({
    value: (remote ? merge(local, remote as never) : local) as never,
    version: 1,
  }));
  return { sync, factory: () => ({ sync }) as never };
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("useSync", () => {
  it("stays off, and makes no requests, until a code exists", async () => {
    const { sync, factory } = fakeFactory();
    const { result } = renderHook(() => useSync(lists, () => {}, factory));
    await flush();
    expect(result.current.status.kind).toBe("off");
    expect(sync).not.toHaveBeenCalled();
  });

  it("turning on stores the code under the shared Sabin Labs key and syncs", async () => {
    const { sync, factory } = fakeFactory();
    const { result } = renderHook(() => useSync(lists, () => {}, factory));
    let code = "";
    act(() => void (code = result.current.turnOn()));
    await flush();
    expect(localStorage.getItem(SYNC_CODE_KEY)).toBe(code);
    expect(sync).toHaveBeenCalled();
    expect(result.current.status.kind).toBe("synced");
  });

  it("rejects an invalid code and accepts a valid one", () => {
    const { factory } = fakeFactory();
    const { result } = renderHook(() => useSync(lists, () => {}, factory));
    let ok = true;
    act(() => void (ok = result.current.useCode("nope")));
    expect(ok).toBe(false);
    expect(localStorage.getItem(SYNC_CODE_KEY)).toBeNull();
    act(() => void (ok = result.current.useCode(` ${newSyncCode()} `)));
    expect(ok).toBe(true);
  });

  it("applies the merged result from the other device", async () => {
    localStorage.setItem(SYNC_CODE_KEY, newSyncCode());
    const other = { watch: { HDL: { at: 5, v: true } }, alerts: {}, txns: {} };
    const { factory } = fakeFactory(other);
    const apply = vi.fn();
    renderHook(() => useSync(lists, apply, factory));
    await flush();
    const merged = apply.mock.calls.at(-1)![0];
    expect(merged.watchlist.sort()).toEqual(["HDL", "NABIL"]);
  });

  it("debounces changes by 2s", async () => {
    vi.useFakeTimers();
    localStorage.setItem(SYNC_CODE_KEY, newSyncCode());
    const { sync, factory } = fakeFactory();
    const { rerender } = renderHook(({ l }) => useSync(l, () => {}, factory), { initialProps: { l: lists } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    sync.mockClear();
    rerender({ l: { ...lists, watchlist: ["NABIL", "NICA"] } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1500)));
    expect(sync).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("shows offline for network failures and errors for server failures", async () => {
    localStorage.setItem(SYNC_CODE_KEY, newSyncCode());
    const failing = (e: Error) => () => ({ sync: async () => { throw e; } }) as never;
    const a = renderHook(() => useSync(lists, () => {}, failing(new TypeError("Failed to fetch"))));
    await flush();
    expect(a.result.current.status.kind).toBe("offline");
    const b = renderHook(() => useSync(lists, () => {}, failing(new Error("HTTP 500"))));
    await flush();
    expect(b.result.current.status.kind).toBe("error");
  });

  it("turning off forgets the code locally", async () => {
    localStorage.setItem(SYNC_CODE_KEY, newSyncCode());
    const { factory } = fakeFactory();
    const { result } = renderHook(() => useSync(lists, () => {}, factory));
    await flush();
    act(() => result.current.turnOff());
    expect(localStorage.getItem(SYNC_CODE_KEY)).toBeNull();
    expect(result.current.status.kind).toBe("off");
  });
});

describe("SyncCard", () => {
  const api = (over: Partial<SyncApi> = {}): SyncApi => ({
    code: null, status: { kind: "off" }, turnOn: vi.fn(() => ""), useCode: vi.fn(() => true), syncNow: vi.fn(), turnOff: vi.fn(), ...over,
  });
  const ui = (s: SyncApi) =>
    render(<Ctx.Provider value={{ tr: makeTr("en") } as unknown as AppState}><SyncCard sync={s} /></Ctx.Provider>);

  it("says the data is end-to-end encrypted and lets you turn on or paste a code", async () => {
    const s = api();
    ui(s);
    expect(screen.getByText(/end-to-end encrypted/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(s.turnOn).toHaveBeenCalled();
  });

  it("flags an invalid pasted code", async () => {
    const s = api({ useCode: vi.fn(() => false) });
    ui(s);
    await userEvent.type(screen.getByLabelText(/Use a code/), "bad");
    await userEvent.click(screen.getByRole("button", { name: "Use code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("not a valid sync code");
  });

  it("shows the code, status and a retry on error", async () => {
    const s = api({ code: "SS1-x", status: { kind: "error" } });
    ui(s);
    expect(screen.getByText("SS1-x")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sync error");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(s.syncNow).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(s.turnOff).toHaveBeenCalled();
  });
});
