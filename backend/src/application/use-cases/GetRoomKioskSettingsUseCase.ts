import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { RoomKioskSettings } from "../../domain/entities/KioskSettings";

export class GetRoomKioskSettingsUseCase {
  constructor(private readonly kioskSettingsRepository: KioskSettingsRepository) {}

  execute(localidade: string, roomEmail: string): Promise<RoomKioskSettings> {
    return this.kioskSettingsRepository.get(localidade, roomEmail);
  }
}
