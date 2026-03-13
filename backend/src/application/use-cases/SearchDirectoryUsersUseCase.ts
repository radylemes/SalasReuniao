import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";

export class SearchDirectoryUsersUseCase {
  constructor(private readonly graphGateway: GraphRoomsGateway) {}

  async execute(tenant: Tenant, query: string) {
    return this.graphGateway.searchDirectoryUsers(tenant, query);
  }
}
