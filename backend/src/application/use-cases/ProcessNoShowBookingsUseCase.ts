import { checkInGraceMs } from "../../domain/checkIn";
import { isSyntheticScheduleEventId } from "../../domain/mergeScheduleBookings";
import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { TenantRepository } from "../../domain/contracts/TenantRepository";

export class ProcessNoShowBookingsUseCase {
  constructor(
    private readonly kioskSettingsRepository: KioskSettingsRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly graphGateway: GraphRoomsGateway,
  ) {}

  async execute(now = new Date()): Promise<number> {
    const rooms = await this.kioskSettingsRepository.listRoomsWithCheckInEnabled();
    let cancelled = 0;

    for (const { localidade, roomEmail } of rooms) {
      const tenant = await this.tenantRepository.findByLocalidade(localidade);
      if (!tenant) continue;

      const roomSettings = await this.kioskSettingsRepository.get(localidade, roomEmail);
      const graceMs = checkInGraceMs(roomSettings.checkInGraceMinutes);

      const start = this.startOfDayIso(now);
      const end = this.endOfDayIso(now);
      const bookings = await this.graphGateway.listBookings(tenant, { start, end });
      const roomBookings = bookings.filter(
        (b) => b.roomEmail.toLowerCase() === roomEmail.toLowerCase(),
      );

      for (const booking of roomBookings) {
        if (isSyntheticScheduleEventId(booking.eventId)) continue;
        if (!booking.requiresCheckIn || booking.checkedIn) continue;

        const startMs = Date.parse(booking.start);
        if (Number.isNaN(startMs)) continue;
        if (now.getTime() < startMs + graceMs) continue;

        const requesterEmail = booking.organizer?.includes("@") ? booking.organizer : undefined;
        await this.graphGateway.cancelBooking(tenant, booking.eventId, {
          ...(requesterEmail !== undefined && { requesterEmail }),
          roomEmail: booking.roomEmail,
          start: booking.start,
          end: booking.end,
          title: booking.title,
        });
        cancelled++;
      }
    }

    return cancelled;
  }

  private startOfDayIso(date: Date): string {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  }

  private endOfDayIso(date: Date): string {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy.toISOString();
  }
}
