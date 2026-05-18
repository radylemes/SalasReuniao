import { Injectable } from '@angular/core';
import { BookingView } from '../models/ui.models';
import { isInstantInsideInterval } from '../utils/schedule-overlap';

export interface StoredTabletPendingBooking {
  eventId: string;
  roomEmail: string;
  roomName: string;
  title: string;
  startTime: string;
  endTime: string;
  organizer?: string;
  requiresCheckIn: boolean;
  checkedIn: boolean;
}

const STORAGE_KEY = 'tablet-pending-checkin-booking';

@Injectable({ providedIn: 'root' })
export class TabletPendingCheckinService {
  save(booking: StoredTabletPendingBooking): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(booking));
    } catch {
      /* ignore */
    }
  }

  load(): StoredTabletPendingBooking | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredTabletPendingBooking;
      if (!parsed?.eventId || !parsed.roomEmail || !parsed.startTime || !parsed.endTime) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  markCheckedIn(eventId: string): void {
    const current = this.load();
    if (!current || current.eventId !== eventId) return;
    this.save({ ...current, checkedIn: true });
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  toBookingView(stored: StoredTabletPendingBooking): BookingView {
    return {
      eventId: stored.eventId,
      roomEmail: stored.roomEmail,
      roomName: stored.roomName,
      title: stored.title,
      startTime: stored.startTime,
      endTime: stored.endTime,
      organizer: stored.organizer,
      requiresCheckIn: stored.requiresCheckIn,
      checkedIn: stored.checkedIn,
    };
  }

  /** Inclui reserva guardada no tablet se ainda estiver no intervalo e sem check-in. */
  mergeWithBookings(roomEmail: string, bookings: BookingView[], now: Date): BookingView[] {
    const stored = this.load();
    if (!stored) return bookings;
    if (stored.roomEmail.toLowerCase() !== roomEmail.toLowerCase()) return bookings;
    if (stored.checkedIn) return bookings;

    const nowMs = now.getTime();
    if (!isInstantInsideInterval(nowMs, stored.startTime, stored.endTime)) {
      return bookings;
    }

    if (bookings.some((b) => b.eventId === stored.eventId)) {
      return bookings;
    }

    return [...bookings, this.toBookingView(stored)];
  }

  findActive(roomEmail: string, now: Date): BookingView | null {
    const stored = this.load();
    if (!stored || stored.checkedIn) return null;
    if (stored.roomEmail.toLowerCase() !== roomEmail.toLowerCase()) return null;

    const nowMs = now.getTime();
    if (!isInstantInsideInterval(nowMs, stored.startTime, stored.endTime)) {
      return null;
    }

    return this.toBookingView(stored);
  }
}
