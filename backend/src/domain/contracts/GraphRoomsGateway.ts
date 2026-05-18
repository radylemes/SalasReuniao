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
  getBooking(
    tenant: Tenant,
    eventId: string,
    requesterEmail?: string,
    fallbackRoomEmail?: string,
  ): Promise<Booking | null>;
  markBookingRequiresCheckIn(tenant: Tenant, eventId: string, requesterEmail?: string): Promise<void>;
  checkInBooking(tenant: Tenant, eventId: string, requesterEmail?: string): Promise<void>;
  cancelBooking(
    tenant: Tenant,
    eventId: string,
    options?: {
      requesterEmail?: string;
      roomEmail?: string;
      start?: string;
      end?: string;
      title?: string;
    },
  ): Promise<void>;
  searchDirectoryUsers(tenant: Tenant, query: string): Promise<DirectoryUser[]>;
}
