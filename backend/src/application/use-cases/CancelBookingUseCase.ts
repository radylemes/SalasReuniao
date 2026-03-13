import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";

export class CancelBookingUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  execute(tenant: Tenant, eventId: string) {
    return this.graphGateway.cancelBooking(tenant, eventId);
  }
}
