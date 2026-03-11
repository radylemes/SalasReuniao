import { BookRoomInput, Room, RoomSchedule } from "../entities/Room";
import { Tenant } from "../entities/Tenant";

export interface GraphRoomsGateway {
  listRooms(tenant: Tenant): Promise<Room[]>;
  getSchedule(
    tenant: Tenant,
    roomEmails: string[],
    start: string,
    end: string,
  ): Promise<RoomSchedule[]>;
  bookRoom(tenant: Tenant, input: BookRoomInput): Promise<{ eventId: string }>;
}
