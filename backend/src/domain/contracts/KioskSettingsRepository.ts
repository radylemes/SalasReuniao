import { RoomKioskSettings, RoomKioskSettingsKey } from "../entities/KioskSettings";

export interface KioskSettingsRepository {
  get(localidade: string, roomEmail: string): Promise<RoomKioskSettings>;
  save(localidade: string, roomEmail: string, settings: RoomKioskSettings): Promise<void>;
  listRoomsWithCheckInEnabled(): Promise<RoomKioskSettingsKey[]>;
}
