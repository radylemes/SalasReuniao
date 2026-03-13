import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";

export class ListBookingsUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  execute(tenant: Tenant, input: { start: string; end: string }) {
    return this.graphGateway.listBookings(tenant, input);
  }
}
