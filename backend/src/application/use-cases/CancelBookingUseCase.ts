import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";

export interface CancelBookingInput {
  requesterEmail?: string;
  roomEmail?: string;
  start?: string;
  end?: string;
  title?: string;
}

export class CancelBookingUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  execute(tenant: Tenant, eventId: string, options?: CancelBookingInput) {
    return this.graphGateway.cancelBooking(tenant, eventId, options);
  }
}
