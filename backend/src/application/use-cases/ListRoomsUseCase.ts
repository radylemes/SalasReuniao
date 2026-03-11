import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";

export class ListRoomsUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  execute(tenant: Tenant) {
    return this.graphGateway.listRooms(tenant);
  }
}
