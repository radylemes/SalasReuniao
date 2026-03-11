import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../errors/AppError";

export class BookRoomUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  async execute(
    tenant: Tenant,
    input: { roomEmail: string; title: string; start: string; end: string },
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

    return this.graphGateway.bookRoom(tenant, input);
  }
}
