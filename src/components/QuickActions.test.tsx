import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuickActions from "./QuickActions";
import { Ctx, type AppState } from "./ui";
import { t } from "../lib/i18n";

function setup(watchlist: string[]) {
  const toggleWatch = vi.fn();
  const onAlert = vi.fn();
  const state = { lang: "en", tr: (k: never) => t("en", k), watchlist, toggleWatch } as unknown as AppState;
  render(
    <Ctx.Provider value={state}>
      <QuickActions symbol="NABIL" onAlert={onAlert} />
    </Ctx.Provider>,
  );
  return { toggleWatch, onAlert };
}

describe("QuickActions", () => {
  it("adds to the watchlist in one tap", async () => {
    const { toggleWatch } = setup([]);
    await userEvent.click(screen.getByRole("button", { name: /add to watchlist/i }));
    expect(toggleWatch).toHaveBeenCalledWith("NABIL");
  });
  it("shows pressed state when already watched", () => {
    setup(["NABIL"]);
    expect(screen.getByRole("button", { name: /watchlist/i })).toHaveAttribute("aria-pressed", "true");
  });
  it("jumps to the alert form in one tap", async () => {
    const { onAlert } = setup([]);
    await userEvent.click(screen.getByRole("button", { name: /alert/i }));
    expect(onAlert).toHaveBeenCalledOnce();
  });
});
