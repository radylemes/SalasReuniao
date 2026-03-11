import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";

export class GetScheduleUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  execute(tenant: Tenant, roomEmails: string[], start: string, end: string) {
    return this.graphGateway.getSchedule(tenant, roomEmails, start, end);
  }
}
