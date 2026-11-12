import { invoke } from "@tauri-apps/api/core";
import type { DashboardClient } from "./client";
export const tauriClient: DashboardClient = {
  getInfo: () => invoke("app_info"),
  getSnapshot: () => invoke("dashboard"),
  check: () => invoke("check_connection"),
  chooseConfig: () => invoke("choose_config"),
};
