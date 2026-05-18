import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { RoomKioskSettings } from "../../domain/entities/KioskSettings";

export class SaveRoomKioskSettingsUseCase {
  constructor(private readonly kioskSettingsRepository: KioskSettingsRepository) {}

  execute(localidade: string, roomEmail: string, settings: RoomKioskSettings): Promise<void> {
    return this.kioskSettingsRepository.save(localidade, roomEmail, settings);
  }
}
