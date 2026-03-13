export interface Room {
  name: string;
  email: string;
  capacity: number | null;
}

export interface ScheduleItem {
  start: string;
  end: string;
  subject?: string;
  status: string;
}

export interface RoomSchedule {
  roomEmail: string;
  availabilityView?: string;
  scheduleItems: ScheduleItem[];
  isAvailable: boolean;
}

export interface AvailabilityEntity {
  email: string;
  isAvailable: boolean;
  availabilityStatus: "available" | "busy" | "unknown" | "not_validated_contact";
  conflicts: ScheduleItem[];
}

export interface AvailabilityPreview {
  start: string;
  end: string;
  room: AvailabilityEntity;
  participants: AvailabilityEntity[];
}

export interface BookRoomInput {
  roomEmail: string;
  title: string;
  start: string;
  end: string;
  requesterEmail: string;
  participants: string[];
}

export interface Booking {
  eventId: string;
  roomEmail: string;
  roomName: string;
  title: string;
  start: string;
  end: string;
  organizer?: string;
}

export interface DirectoryUser {
  name: string;
  email: string;
}
