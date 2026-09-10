import { describe, expect, it } from "vitest";
import { amount, duration, scaled, clockParts } from "./format";
describe("display formatting", () => {
  it("preserves exact satoshis and does not invent unavailable values", () => {
    expect(amount("312500001")).toBe("3.12500001");
    expect(amount("0")).toBe("0");
    expect(amount(null)).toBe("—");
    expect(amount("900719925474099100")).toBe("9,007,199,254.740991");
  });
  it("uses meaningful units and clamps future block age", () => {
    expect(scaled(1200000000000, "H/s")).toBe("1.2 TH/s");
    expect(duration(-100)).toBe("0m 0s");
    expect(duration(609)).toBe("10m 9s");
  });
  it("supports UTC and 24-hour display", () => {
    expect(
      clockParts(Date.UTC(2026, 8, 10, 14, 3), { zone: "UTC", hour12: false })
        .time,
    ).toBe("14:03");
  });
});
