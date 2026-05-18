export interface RoomKioskSettings {
  checkInModeEnabled: boolean;
  /** Minutos após o início da reserva para cancelar sem check-in. */
  checkInGraceMinutes?: number;
}

export interface RoomKioskSettingsKey {
  localidade: string;
  roomEmail: string;
}
