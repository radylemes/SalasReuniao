import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../errors/AppError";
import { blocksBooking } from "../../domain/scheduleOverlap";
import { GetAvailabilityPreviewUseCase } from "./GetAvailabilityPreviewUseCase";

export class BookRoomUseCase {
  constructor(
    private readonly graphGateway: GraphRoomsGateway,
    private readonly getAvailabilityPreviewUseCase: GetAvailabilityPreviewUseCase,
    private readonly kioskSettingsRepository: KioskSettingsRepository,
  ) {}

  async execute(
    tenant: Tenant,
    input: {
      roomEmail: string;
      title: string;
      start: string;
      end: string;
      requesterEmail: string;
      participants: string[];
      allowRequesterConflict?: boolean;
    },
  ) {
    const requesterEmail = input.requesterEmail.trim().toLowerCase();
    const participants = Array.from(
      new Set(
        [requesterEmail, ...input.participants]
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const preview = await this.getAvailabilityPreviewUseCase.execute(tenant, {
      roomEmail: input.roomEmail,
      participants,
      start: input.start,
      end: input.end,
    });
    const busyParticipants = preview.participants.filter((participant) =>
      blocksBooking(input.start, input.end, participant),
    );
    const otherBusy = busyParticipants.filter(
      (participant) => participant.email.trim().toLowerCase() !== requesterEmail,
    );
    if (otherBusy.length > 0) {
      const participantList = otherBusy.map((participant) => participant.email).join(", ");
      throw new AppError(
        "PARTICIPANT_CONFLICT",
        `A agenda de outro participante está ocupada neste horário: ${participantList}.`,
        409,
      );
    }

    const requesterBusy = busyParticipants.some(
      (participant) => participant.email.trim().toLowerCase() === requesterEmail,
    );
    if (requesterBusy && !input.allowRequesterConflict) {
      throw new AppError(
        "REQUESTER_CONFLICT",
        "O solicitante já possui compromisso neste horário.",
        409,
      );
    }

    if (blocksBooking(input.start, input.end, preview.room)) {
      throw new AppError(
        "ROOM_CONFLICT",
        "A sala selecionada não está disponível neste horário.",
        409,
      );
    }

    const kioskSettings = await this.kioskSettingsRepository.get(
      tenant.localidade,
      input.roomEmail,
    );
    const requireCheckIn = kioskSettings.checkInModeEnabled;

    const result = await this.graphGateway.bookRoom(tenant, {
      ...input,
      requireCheckIn,
    });

    if (requireCheckIn) {
      await this.graphGateway.markBookingRequiresCheckIn(
        tenant,
        result.eventId,
        requesterEmail,
      );
    }

    return result;
  }
}
