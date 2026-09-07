import { describe, it, expect } from "vitest";
import { pctToByte, byteToPct } from "./scale";

describe("pctToByte", () => {
  it("maps 0% and 100% to the byte range endpoints", () => {
    expect(pctToByte(0)).toBe(0);
    expect(pctToByte(100)).toBe(255);
  });

  it("maps the midpoint to ~128", () => {
    expect(pctToByte(50)).toBe(128);
  });

  it("clamps out-of-range input", () => {
    expect(pctToByte(-20)).toBe(0);
    expect(pctToByte(140)).toBe(255);
  });
});

describe("byteToPct", () => {
  it("maps byte endpoints to 0% and 100%", () => {
    expect(byteToPct(0)).toBe(0);
    expect(byteToPct(255)).toBe(100);
  });
});

describe("round-trip", () => {
  it("preserves representative percentages within rounding", () => {
    for (const p of [0, 10, 25, 50, 75, 100]) {
      expect(byteToPct(pctToByte(p))).toBeCloseTo(p, 0);
    }
  });
});
