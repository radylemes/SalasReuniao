import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../errors/AppError";
import { blocksBooking } from "../../domain/scheduleOverlap";
import { GetAvailabilityPreviewUseCase } from "./GetAvailabilityPreviewUseCase";

export class BookRoomUseCase {
  constructor(
    private readonly graphGateway: GraphRoomsGateway,
    private readonly getAvailabilityPreviewUseCase: GetAvailabilityPreviewUseCase,
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
    },
  ) {
    const participants = Array.from(
      new Set(
        [input.requesterEmail, ...input.participants]
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
    if (busyParticipants.length > 0) {
      const participantList = busyParticipants.map((participant) => participant.email).join(", ");
      throw new AppError(
        "PARTICIPANT_CONFLICT",
        `Sua agenda ou a de outro participante está ocupada neste horário: ${participantList}.`,
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

    return this.graphGateway.bookRoom(tenant, input);
  }
}
