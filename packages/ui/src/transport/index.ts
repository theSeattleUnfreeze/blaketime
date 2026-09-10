import { isTauri } from "@tauri-apps/api/core";
import { httpClient } from "./http";
import { tauriClient } from "./tauri";
export const client = isTauri() ? tauriClient : httpClient;
