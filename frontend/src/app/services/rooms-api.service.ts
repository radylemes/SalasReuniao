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
}

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  private readonly baseUrl = 'http://localhost:3000/api';

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
  ): Observable<{ eventId: string }> {
    return this.http.post<{ eventId: string }>(
      `${this.baseUrl}/book`,
      { roomEmail, title, start, end },
      { headers: this.localidadeHeader(localidade) },
    );
  }

  private localidadeHeader(localidade: string) {
    return new HttpHeaders({ 'x-localidade': localidade });
  }
}
