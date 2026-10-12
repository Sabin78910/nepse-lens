import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, resolveTheme } from "./theme";

const css = readFileSync("src/index.css", "utf8");

function palette(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)![1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

describe("resolveTheme", () => {
  it("honours a saved choice over the system", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });
  it("follows the system when nothing is saved", () => {
    expect(resolveTheme(null, true)).toBe("light");
    expect(resolveTheme(undefined, false)).toBe("dark");
    expect(resolveTheme("garbage", true)).toBe("light");
  });
});

describe("theme contrast (AA)", () => {
  const dark = palette(":root {");
  const light = { ...dark, ...palette(':root[data-theme="light"]') };
  for (const [name, p] of [["dark", dark], ["light", light]] as const) {
    it(`${name}: text, muted, deltas and accent reach 4.5:1 on surfaces`, () => {
      for (const bg of [p.bg, p.surface, p["surface-2"]]) {
        for (const fg of ["text", "muted", "up", "down", "flat", "accent", "gold"]) {
          expect(contrastRatio(p[fg], bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
