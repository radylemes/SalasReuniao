import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../errors/AppError";

export class CheckInBookingUseCase {
  constructor(
    private readonly graphGateway: GraphRoomsGateway,
    private readonly kioskSettingsRepository: KioskSettingsRepository,
  ) {}

  async execute(
    tenant: Tenant,
    eventId: string,
    options?: { requesterEmail?: string; roomEmail?: string },
  ): Promise<void> {
    const requesterHint = options?.requesterEmail?.includes("@")
      ? options.requesterEmail.trim()
      : undefined;

    const booking = await this.graphGateway.getBooking(
      tenant,
      eventId,
      requesterHint,
      options?.roomEmail,
    );
    if (!booking) {
      throw new AppError("BOOKING_NOT_FOUND", "Reserva nao encontrada.", 404);
    }

    const roomEmail =
      booking.roomEmail?.includes("@") ? booking.roomEmail : (options?.roomEmail ?? booking.roomEmail);

    const kioskSettings = await this.kioskSettingsRepository.get(
      tenant.localidade,
      roomEmail,
    );
    const checkInRequired = booking.requiresCheckIn || kioskSettings.checkInModeEnabled;

    if (!checkInRequired) {
      throw new AppError(
        "CHECKIN_NOT_REQUIRED",
        "Esta reserva nao exige check-in.",
        409,
      );
    }

    if (booking.checkedIn) {
      throw new AppError("ALREADY_CHECKED_IN", "Check-in ja realizado.", 409);
    }

    const requesterEmail = booking.organizer?.includes("@") ? booking.organizer : undefined;

    if (!booking.requiresCheckIn && kioskSettings.checkInModeEnabled) {
      await this.graphGateway.markBookingRequiresCheckIn(tenant, eventId, requesterEmail);
    }

    await this.graphGateway.checkInBooking(tenant, eventId, requesterEmail);
  }
}
