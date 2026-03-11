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

export interface BookRoomInput {
  roomEmail: string;
  title: string;
  start: string;
  end: string;
}
