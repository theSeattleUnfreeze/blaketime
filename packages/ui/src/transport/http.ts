import type { DashboardClient } from "./client";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw body?.error ?? "unreachable";
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
export const httpClient: DashboardClient = {
  getInfo: (signal) => request("/api/app", { signal }),
  getSnapshot: (signal) => request("/api/dashboard", { signal }),
  check: () =>
    request("/api/node/check", {
      method: "POST",
      headers: { "x-blaketime-check": "1" },
    }),
};
