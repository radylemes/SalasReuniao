export interface RoomView {
  id: string;
  name: string;
  email: string;
  capacity: number;
  location: string;
  status: 'available' | 'occupied';
  occupancyPercent: number;
}

export interface TimeSlotView {
  time: string;
  status: 'available' | 'occupied';
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  bookedBy?: string;
}

export interface BookingView {
  eventId: string;
  roomEmail: string;
  roomName: string;
  title: string;
  startTime: string;
  endTime: string;
  organizer?: string;
}

export interface BookingSubmitPayload {
  title: string;
  startTime: string;
  endTime: string;
  requesterEmail: string;
  participants: string[];
}
