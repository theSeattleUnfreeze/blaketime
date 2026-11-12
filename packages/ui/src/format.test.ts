import { describe, expect, it } from "vitest";
import {
  amount,
  duration,
  freshSample,
  scaled,
  clockParts,
  timestamp,
  percent,
} from "./format";
describe("display formatting", () => {
  it("preserves exact satoshis and does not invent unavailable values", () => {
    expect(amount("312500001")).toBe("3.12500001");
    expect(amount("0")).toBe("0");
    expect(amount(null)).toBe("—");
    expect(amount("900719925474099100")).toBe("9,007,199,254.740991");
  });
  it("uses meaningful units and clamps future block age", () => {
    expect(scaled(1200000000000, "H/s")).toBe("1.2 TH/s");
    expect(scaled(1.2e21, "H/s")).toBe("1.2 ZH/s");
    expect(scaled(999.996e12, "H/s")).toBe("1 PH/s");
    expect(scaled(-1, "H/s")).toBe("—");
    expect(duration(-100)).toBe("0m 0s");
    expect(duration(609)).toBe("10m 9s");
    expect(duration(90061)).toBe("1d 1h 1m");
    expect(percent(0.123456, 2)).toBe("12.35%");
  });
  it("keeps sample age on the server clock and dates a later update", () => {
    expect(freshSample(1_000, 1_090, 120)).toBe(true);
    expect(freshSample(1_000, 1_121, 120)).toBe(false);
    expect(freshSample(1_004, 1_000, 120)).toBe(true);
    expect(freshSample(1_010, 1_000, 120)).toBe(false);
    expect(
      timestamp(
        Date.UTC(2026, 8, 10, 14, 3, 5) / 1000,
        Date.UTC(2026, 8, 10, 16, 0, 0),
        { zone: "UTC", hour12: false },
      ),
    ).toBe("14:03:05");
    expect(
      timestamp(
        Date.UTC(2026, 8, 9, 14, 3, 5) / 1000,
        Date.UTC(2026, 8, 10, 16, 0, 0),
        { zone: "UTC", hour12: false },
      ),
    ).toBe("Sep 9, 14:03:05");
  });
  it("supports UTC and 24-hour display", () => {
    expect(
      clockParts(Date.UTC(2026, 8, 10, 14, 3), { zone: "UTC", hour12: false })
        .time,
    ).toBe("14:03");
  });
});
