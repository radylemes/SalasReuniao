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
  /** Início da janela usada no getSchedule (horário local Graph, ex. 2026-05-16T18:30:00). */
  scheduleGraphStart?: string;
  availabilityViewIntervalMinutes?: number;
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
  requireCheckIn?: boolean;
}

export interface Booking {
  eventId: string;
  roomEmail: string;
  roomName: string;
  title: string;
  start: string;
  end: string;
  organizer?: string;
  requiresCheckIn?: boolean;
  checkedIn?: boolean;
}

export interface DirectoryUser {
  name: string;
  email: string;
}
