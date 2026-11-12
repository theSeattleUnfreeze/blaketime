import { invoke } from '@tauri-apps/api/core';
import type { UpdateStatus } from '@blaketime/contracts';
export interface UpdateClient {
  status(): Promise<UpdateStatus>;
  check(): Promise<void>;
  install(): Promise<void>;
  setAutomatic(automatic: boolean): Promise<void>;
}
export const updateClient: UpdateClient = {
  status: () => invoke('update_status'),
  check: () => invoke('check_updates'),
  install: () => invoke('install_update'),
  setAutomatic: automatic => invoke('set_automatic_updates', { automatic })
};
