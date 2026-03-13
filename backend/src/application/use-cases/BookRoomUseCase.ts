import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../errors/AppError";

export class BookRoomUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

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
    const schedule = await this.graphGateway.getSchedule(
      tenant,
      [input.roomEmail],
      input.start,
      input.end,
    );
    const roomSchedule = schedule[0];

    if (!roomSchedule?.isAvailable) {
      throw new AppError(
        "ROOM_CONFLICT",
        "A sala selecionada nao esta disponivel no intervalo informado.",
        409,
      );
    }

    const preview = await this.graphGateway.getAvailabilityPreview(
      tenant,
      input.roomEmail,
      input.participants,
      input.start,
      input.end,
    );
    const busyParticipants = preview.participants.filter(
      (participant) => participant.availabilityStatus === "busy",
    );
    if (busyParticipants.length > 0) {
      const participantList = busyParticipants.map((participant) => participant.email).join(", ");
      throw new AppError(
        "PARTICIPANT_CONFLICT",
        `Participante(s) indisponivel(is) no intervalo informado: ${participantList}.`,
        409,
      );
    }

    return this.graphGateway.bookRoom(tenant, input);
  }
}
