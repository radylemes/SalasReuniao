import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface RoomDto {
  name: string;
  email: string;
  capacity: number | null;
}

export interface RoomScheduleDto {
  roomEmail: string;
  isAvailable: boolean;
  availabilityView?: string;
  scheduleItems: ScheduleItemDto[];
}

export interface ScheduleItemDto {
  start: string;
  end: string;
  status: string;
  subject?: string;
}

export interface BookingDto {
  eventId: string;
  roomEmail: string;
  roomName: string;
  title: string;
  start: string;
  end: string;
  organizer?: string;
}

export interface DirectoryUserDto {
  name: string;
  email: string;
}

export interface AvailabilityConflictDto {
  start: string;
  end: string;
  subject?: string;
  status: string;
}

export interface AvailabilityItemDto {
  email: string;
  isAvailable: boolean;
  availabilityStatus?: 'available' | 'busy' | 'unknown' | 'not_validated_contact';
  conflicts: AvailabilityConflictDto[];
}

export interface AvailabilityPreviewDto {
  start: string;
  end: string;
  room: AvailabilityItemDto;
  participants: AvailabilityItemDto[];
}

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  private readonly baseUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  getRooms(localidade: string): Observable<{ rooms: RoomDto[] }> {
    return this.http.get<{ rooms: RoomDto[] }>(`${this.baseUrl}/rooms`, {
      headers: this.localidadeHeader(localidade),
    });
  }

  checkSchedule(
    localidade: string,
    rooms: string[],
    start: string,
    end: string,
  ): Observable<{ schedule: RoomScheduleDto[] }> {
    return this.http.post<{ schedule: RoomScheduleDto[] }>(
      `${this.baseUrl}/schedule`,
      { rooms, start, end },
      { headers: this.localidadeHeader(localidade) },
    );
  }

  bookRoom(
    localidade: string,
    roomEmail: string,
    title: string,
    start: string,
    end: string,
    requesterEmail: string,
    participants: string[],
  ): Observable<{ eventId: string }> {
    return this.http.post<{ eventId: string }>(
      `${this.baseUrl}/book`,
      { roomEmail, title, start, end, requesterEmail, participants },
      { headers: this.localidadeHeader(localidade) },
    );
  }

  searchDirectoryUsers(localidade: string, query: string): Observable<{ users: DirectoryUserDto[] }> {
    return this.http.get<{ users: DirectoryUserDto[] }>(`${this.baseUrl}/directory/users`, {
      headers: this.localidadeHeader(localidade),
      params: { query },
    });
  }

  previewAvailability(
    localidade: string,
    payload: { roomEmail: string; participants: string[]; start: string; end: string },
  ): Observable<{ preview: AvailabilityPreviewDto }> {
    return this.http.post<{ preview: AvailabilityPreviewDto }>(
      `${this.baseUrl}/availability/preview`,
      payload,
      { headers: this.localidadeHeader(localidade) },
    );
  }

  listBookings(localidade: string, start?: string, end?: string): Observable<{ bookings: BookingDto[] }> {
    const params: Record<string, string> = {};
    if (start) params['start'] = start;
    if (end) params['end'] = end;
    return this.http.get<{ bookings: BookingDto[] }>(`${this.baseUrl}/bookings`, {
      headers: this.localidadeHeader(localidade),
      params,
    });
  }

  private localidadeHeader(localidade: string) {
    return new HttpHeaders({ 'x-localidade': localidade });
  }
}
