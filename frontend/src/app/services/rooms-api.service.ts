import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TabletKioskConfigService } from './tablet-kiosk-config.service';

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
  requiresCheckIn?: boolean;
  checkedIn?: boolean;
}

export interface RoomKioskSettingsDto {
  checkInModeEnabled: boolean;
  checkInGraceMinutes?: number;
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
  constructor(
    private readonly http: HttpClient,
    private readonly kioskConfig: TabletKioskConfigService,
  ) {}

  private get baseUrl(): string {
    return this.kioskConfig.getConfig().apiBaseUrl;
  }

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
    allowRequesterConflict?: boolean,
  ): Observable<{ eventId: string }> {
    return this.http.post<{ eventId: string }>(
      `${this.baseUrl}/book`,
      { roomEmail, title, start, end, requesterEmail, participants, allowRequesterConflict: allowRequesterConflict ?? false },
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

  checkInBooking(
    localidade: string,
    eventId: string,
    options?: { organizer?: string; roomEmail?: string },
  ): Observable<void> {
    const params: Record<string, string> = {};
    if (options?.organizer?.includes('@')) {
      params['organizer'] = options.organizer.trim();
    }
    if (options?.roomEmail?.includes('@')) {
      params['roomEmail'] = options.roomEmail.trim();
    }
    return this.http.post<void>(
      `${this.baseUrl}/bookings/${encodeURIComponent(eventId)}/check-in`,
      {},
      { headers: this.localidadeHeader(localidade), params },
    );
  }

  cancelBooking(
    localidade: string,
    eventId: string,
    options?: {
      organizer?: string;
      roomEmail?: string;
      start?: string;
      end?: string;
      title?: string;
    },
  ): Observable<void> {
    const params: Record<string, string> = {};
    if (options?.organizer?.includes('@')) {
      params['organizer'] = options.organizer.trim();
    }
    if (options?.roomEmail?.includes('@')) {
      params['roomEmail'] = options.roomEmail.trim();
    }
    if (options?.start) params['start'] = options.start;
    if (options?.end) params['end'] = options.end;
    if (options?.title?.trim()) params['title'] = options.title.trim();
    return this.http.delete<void>(
      `${this.baseUrl}/bookings/${encodeURIComponent(eventId)}`,
      { headers: this.localidadeHeader(localidade), params },
    );
  }

  getKioskSettings(localidade: string, roomEmail: string): Observable<RoomKioskSettingsDto> {
    return this.http.get<RoomKioskSettingsDto>(
      `${this.baseUrl}/rooms/${encodeURIComponent(roomEmail)}/kiosk-settings`,
      { headers: this.localidadeHeader(localidade) },
    );
  }

  putKioskSettings(
    localidade: string,
    roomEmail: string,
    settings: RoomKioskSettingsDto,
  ): Observable<RoomKioskSettingsDto> {
    return this.http.put<RoomKioskSettingsDto>(
      `${this.baseUrl}/rooms/${encodeURIComponent(roomEmail)}/kiosk-settings`,
      settings,
      { headers: this.localidadeHeader(localidade) },
    );
  }

  private localidadeHeader(localidade: string) {
    return new HttpHeaders({ 'x-localidade': localidade });
  }
}
