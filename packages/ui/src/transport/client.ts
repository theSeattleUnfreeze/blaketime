import type { AppInfo, Snapshot } from "@blaketime/contracts";
export interface DashboardClient {
  getInfo(signal?: AbortSignal): Promise<AppInfo>;
  getSnapshot(signal?: AbortSignal): Promise<Snapshot>;
  check(): Promise<void>;
  chooseConfig?: () => Promise<void>;
}
