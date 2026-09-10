import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChainClock } from "./ChainClock";
import { StatusBanner } from "./StatusBanner";
afterEach(cleanup);
it.each(["constructor", "toString", "__proto__"])("handles unknown error code %s safely", (code) => {
  render(<StatusBanner snapshot={null} error={code} desktop={false} needsReload={false} />);
  expect(screen.getByRole("status").textContent).toContain("Could not refresh the dashboard");
});
it("renders unavailable data without fabricated heights or blocks", () => {
  render(<ChainClock snapshot={null} now={0} />);
  expect(screen.getByTestId("block-height").textContent).toBe("—");
  expect(screen.getByText("Showing 0 recent blocks")).toBeTruthy();
  expect(screen.getByText("Halving progress: Unavailable")).toBeTruthy();
});
it("does not expose raw error details", () => {
  render(
    <StatusBanner
      snapshot={null}
      error={new Error("secret-rpc-password")}
      desktop={false}
      needsReload={false}
    />,
  );
  expect(screen.queryByText(/secret-rpc/)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(
    "Could not refresh the dashboard",
  );
});
