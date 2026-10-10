import { describe, expect, it } from "vitest";
import { upstream } from "../../worker/src/index";

describe("worker routing", () => {
  it("maps latest.json to the live branch", () => {
    expect(upstream("/latest.json")).toEqual({ url: expect.stringContaining("/live/latest.json"), ttl: 60 });
  });
  it("maps data paths and rejects traversal or non-JSON", () => {
    expect(upstream("/data/accum/NABIL.json")?.url).toContain("/data/accum/NABIL.json");
    expect(upstream("/data/../secret.json")).toBeNull();
    expect(upstream("/data/x.txt")).toBeNull();
    expect(upstream("/")).toBeNull();
  });
});
