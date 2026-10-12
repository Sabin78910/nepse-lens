import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const SAMPLE = join(process.cwd(), "public", "sample");

// Serves files from public/sample; everything else (the live branches) is a 404 so the app falls back to the sample.
function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const at = url.indexOf("sample/");
      if (at >= 0) {
        try {
          const body = readFileSync(join(SAMPLE, url.slice(at + 7).split("?")[0]), "utf8");
          return new Response(body, { status: 200 });
        } catch {
          // fall through to 404
        }
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

async function open(hash: string) {
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole("main");
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn();
  mockFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App smoke tests", () => {
  it("shows the SAMPLE banner and the NEPSE index", async () => {
    await open("#/market");
    expect(await screen.findByRole("note")).toHaveTextContent("SAMPLE");
    expect((await screen.findAllByText(/nepse/i)).length).toBeGreaterThan(0);
    expect(document.querySelector(".hero-value")).toBeInTheDocument();
  });

  it.each(["#/stock/NABIL", "#/brokers", "#/portfolio", "#/more", "#/watch"])("renders %s without errors", async (hash) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await open(hash);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("main")).not.toBeEmptyDOMElement();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("switches labels to Nepali", async () => {
    await open("#/more");
    expect(screen.getByRole("link", { name: "Brokers" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("radio", { name: "नेपाली" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "ब्रोकर" })).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Brokers" })).not.toBeInTheDocument();
  });

  it("shows empty states for a stock with no prices or accumulation file", async () => {
    await open("#/stock/ACLBSLP");
    expect(await screen.findByText(/No floorsheet trades/i)).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
