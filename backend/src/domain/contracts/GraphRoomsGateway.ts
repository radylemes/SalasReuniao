import { AvailabilityPreview, Booking, BookRoomInput, DirectoryUser, Room, RoomSchedule } from "../entities/Room";
import { Tenant } from "../entities/Tenant";

export interface GraphRoomsGateway {
  listRooms(tenant: Tenant): Promise<Room[]>;
  getSchedule(
    tenant: Tenant,
    roomEmails: string[],
    start: string,
    end: string,
  ): Promise<RoomSchedule[]>;
  getAvailabilityPreview(
    tenant: Tenant,
    roomEmail: string,
    participantEmails: string[],
    start: string,
    end: string,
  ): Promise<AvailabilityPreview>;
  bookRoom(tenant: Tenant, input: BookRoomInput): Promise<{ eventId: string }>;
  listBookings(tenant: Tenant, input: { start: string; end: string }): Promise<Booking[]>;
  cancelBooking(tenant: Tenant, eventId: string): Promise<void>;
  searchDirectoryUsers(tenant: Tenant, query: string): Promise<DirectoryUser[]>;
}
