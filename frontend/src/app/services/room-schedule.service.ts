import { Injectable } from '@angular/core';
import { BookingView, TimeSlotView } from '../models/ui.models';
import { RoomScheduleDto, ScheduleItemDto } from './rooms-api.service';
import { isBusyScheduleStatus, isInstantInsideInterval, overlapsInterval } from '../utils/schedule-overlap';

export const BRAZIL_TIME_OFFSET = '-03:00';
export const WORK_HOURS_START = 9;
export const WORK_HOURS_END = 17;
export const WORK_HOURS_TOTAL = WORK_HOURS_END - WORK_HOURS_START;

export interface UpcomingMeetingView {
  time: string;
  title: string;
  organizer?: string;
  startTime: string;
  endTime: string;
}

export interface CurrentRoomStatus {
  status: 'available' | 'occupied' | 'awaiting_checkin';
  subtitle: string;
  currentMeetingTitle?: string;
  pendingCheckInBooking?: BookingView;
}

export interface WorkHoursOccupancy {
  occupiedHours: number;
  totalHours: number;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class RoomScheduleService {
  buildDayRange(date: string): { start: string; end: string } {
    const nextDate = this.getNextDate(date);
    return {
      start: this.toBrazilIso(date, 0, 0, 0),
      end: this.toBrazilIso(nextDate, 0, 0, 0),
    };
  }

  buildTimeSlots(
    date: string,
    scheduleItems: ScheduleItemDto[],
    roomBookings: BookingView[] = [],
  ): TimeSlotView[] {
    const nextDate = this.getNextDate(date);
    return Array.from({ length: 48 }, (_, index) => {
      const startMinute = index * 30;
      const endMinute = startMinute + 30;
      const startTime = this.toBrazilIso(date, Math.floor(startMinute / 60), startMinute % 60);
      const endTime =
        endMinute === 24 * 60
          ? this.toBrazilIso(nextDate, 0, 0, 0)
          : this.toBrazilIso(date, Math.floor(endMinute / 60), endMinute % 60);
      const hasScheduleConflict = scheduleItems.some(
        (item) => isBusyScheduleStatus(item.status) && overlapsInterval(startTime, endTime, item.start, item.end),
      );
      const hasBookingConflict = roomBookings.some((booking) =>
        overlapsInterval(startTime, endTime, booking.startTime, booking.endTime),
      );
      const hasConflict = hasScheduleConflict || hasBookingConflict;

      return {
        time: this.formatMinutes(startMinute),
        status: hasConflict ? 'occupied' : 'available',
        startMinute,
        endMinute,
        startTime,
        endTime,
        bookedBy: hasConflict ? this.resolveBookedBy(startTime, endTime, scheduleItems, roomBookings) : undefined,
      };
    });
  }

  /**
   * Horários clicáveis para reserva: blocos de 30 min futuros + intervalo parcial desde "agora"
   * até o fim do bloco atual (ex.: 19:01–19:30), se o bloco estiver livre.
   */
  getBookableSlots(slots: TimeSlotView[], now: Date, date: string): TimeSlotView[] {
    const nowMs = now.getTime();
    const partial = this.buildCurrentPartialSlot(slots, now, date);
    const blockStartMinute =
      partial != null ? Math.floor(partial.startMinute / 30) * 30 : null;
    const future = slots.filter((slot) => {
      const slotStartMs = new Date(slot.startTime).getTime();
      if (slotStartMs < nowMs) return false;
      if (blockStartMinute != null && slot.startMinute === blockStartMinute) return false;
      return true;
    });
    if (!partial) {
      return future;
    }
    return [partial, ...future];
  }

  private buildCurrentPartialSlot(slots: TimeSlotView[], now: Date, date: string): TimeSlotView | null {
    const wall = this.getBrazilWallClockParts(now);
    if (wall.date !== date) {
      return null;
    }

    const totalMinutes = wall.hour * 60 + wall.minute;
    const blockStartMinute = Math.floor(totalMinutes / 30) * 30;
    const blockEndMinute = blockStartMinute + 30;
    const blockSlot = slots.find((slot) => slot.startMinute === blockStartMinute);
    if (!blockSlot || blockSlot.status !== 'available') {
      return null;
    }

    const startTime = this.toBrazilIsoFromDate(now);
    return {
      time: this.formatMinutes(totalMinutes),
      status: 'available',
      startMinute: totalMinutes,
      endMinute: blockEndMinute,
      startTime,
      endTime: blockSlot.endTime,
    };
  }

  private getBrazilWallClockParts(date: Date): { date: string; hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return {
      date: `${year}-${month}-${day}`,
      hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
      minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
    };
  }

  getOccupancyPercent(date: string, roomSchedule?: RoomScheduleDto): number {
    if (!roomSchedule) return 0;
    const items = roomSchedule.scheduleItems ?? [];
    if (items.length === 0) {
      return roomSchedule.isAvailable ? 0 : 100;
    }
    const slots = this.buildTimeSlots(date, items);
    const occupiedCount = slots.filter((slot) => slot.status === 'occupied').length;
    if (slots.length === 0) return 0;
    return Math.round((occupiedCount / slots.length) * 100);
  }

  getWorkHoursOccupancy(date: string, scheduleItems: ScheduleItemDto[]): WorkHoursOccupancy {
    const slots = this.buildTimeSlots(date, scheduleItems);
    const workSlots = slots.filter(
      (slot) => slot.startMinute >= WORK_HOURS_START * 60 && slot.endMinute <= WORK_HOURS_END * 60,
    );
    const occupiedSlots = workSlots.filter((slot) => slot.status === 'occupied').length;
    const occupiedHours = Math.round((occupiedSlots * 0.5 * 10)) / 10;
    const totalHours = WORK_HOURS_TOTAL;
    const roundedHours = Math.min(totalHours, Math.round(occupiedHours));
    return {
      occupiedHours: roundedHours,
      totalHours,
      label: `${roundedHours} de ${totalHours} horas`,
    };
  }

  getCurrentStatus(
    now: Date,
    scheduleItems: ScheduleItemDto[],
    roomBookings: BookingView[] = [],
    checkInModeEnabled = false,
  ): CurrentRoomStatus {
    const nowMs = now.getTime();

    const activeItem = scheduleItems.find(
      (item) =>
        isBusyScheduleStatus(item.status) && isInstantInsideInterval(nowMs, item.start, item.end),
    );

    const activeBooking = this.resolveActiveBooking(nowMs, roomBookings, activeItem);

    const needsCheckIn = checkInModeEnabled && activeBooking && !activeBooking.checkedIn;

    if (needsCheckIn) {
      const title =
        activeBooking.title?.trim() ||
        activeBooking.organizer?.trim() ||
        'Reserva agendada';
      return {
        status: 'awaiting_checkin',
        subtitle: `Aguardando check-in — ${title}`,
        currentMeetingTitle: title,
        pendingCheckInBooking: activeBooking,
      };
    }

    if (activeBooking?.requiresCheckIn && activeBooking.checkedIn) {
      const title = activeBooking.title?.trim() || activeBooking.organizer?.trim() || 'Reunião em curso';
      return {
        status: 'occupied',
        subtitle: title,
        currentMeetingTitle: title,
      };
    }

    if (activeItem || activeBooking) {
      const title =
        activeBooking?.title?.trim() ||
        activeBooking?.organizer?.trim() ||
        activeItem?.subject?.trim() ||
        'Reunião em curso';
      return {
        status: 'occupied',
        subtitle: title,
        currentMeetingTitle: title,
      };
    }

    return {
      status: 'available',
      subtitle: 'Sala pronta para uso',
    };
  }

  /** Reserva ativa que ainda precisa de check-in (modo kiosk). */
  findPendingCheckInBooking(
    now: Date,
    scheduleItems: ScheduleItemDto[],
    roomBookings: BookingView[],
  ): BookingView | undefined {
    const nowMs = now.getTime();
    const activeItem = scheduleItems.find(
      (item) =>
        isBusyScheduleStatus(item.status) && isInstantInsideInterval(nowMs, item.start, item.end),
    );
    const booking = this.resolveActiveBooking(nowMs, roomBookings, activeItem);
    if (!booking || booking.checkedIn) return undefined;
    return booking;
  }

  private resolveActiveBooking(
    nowMs: number,
    roomBookings: BookingView[],
    activeItem?: ScheduleItemDto,
  ): BookingView | undefined {
    const slackMs = 2 * 60_000;

    const inInterval = roomBookings.find((b) => this.isInstantInsideBooking(nowMs, b, slackMs));
    if (inInterval) return inInterval;

    if (activeItem) {
      const byOverlap = roomBookings.find((b) =>
        overlapsInterval(activeItem.start, activeItem.end, b.startTime, b.endTime),
      );
      if (byOverlap) return byOverlap;

      const subject = activeItem.subject?.trim().toLowerCase();
      if (subject) {
        const bySubject = roomBookings.find((b) => {
          const title = b.title?.trim().toLowerCase() ?? '';
          const organizer = b.organizer?.trim().toLowerCase() ?? '';
          return (
            (title.includes(subject) || subject.includes(title) || organizer.includes(subject)) &&
            overlapsInterval(activeItem.start, activeItem.end, b.startTime, b.endTime)
          );
        });
        if (bySubject) return bySubject;
      }
    }

    return roomBookings.find((b) => this.isInstantInsideBooking(nowMs, b, slackMs));
  }

  private isInstantInsideBooking(instantMs: number, booking: BookingView, slackMs: number): boolean {
    const startMs = new Date(booking.startTime).getTime() - slackMs;
    const endMs = new Date(booking.endTime).getTime() + slackMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    return instantMs >= startMs && instantMs < endMs;
  }

  getUpcomingMeetings(
    now: Date,
    scheduleItems: ScheduleItemDto[],
    roomBookings: BookingView[],
    limit = 10,
  ): UpcomingMeetingView[] {
    const nowMs = now.getTime();
    const fromBookings: UpcomingMeetingView[] = roomBookings
      .filter((b) => new Date(b.startTime).getTime() > nowMs)
      .map((b) => ({
        time: this.formatIsoTime(b.startTime),
        title: b.title?.trim() || 'Reunião',
        organizer: b.organizer?.trim(),
        startTime: b.startTime,
        endTime: b.endTime,
      }));

    const fromSchedule: UpcomingMeetingView[] = scheduleItems
      .filter((item) => isBusyScheduleStatus(item.status) && new Date(item.start).getTime() > nowMs)
      .map((item) => ({
        time: this.formatIsoTime(item.start),
        title: item.subject?.trim() || 'Reunião',
        organizer: undefined,
        startTime: item.start,
        endTime: item.end,
      }));

    const merged = new Map<string, UpcomingMeetingView>();
    for (const meeting of [...fromBookings, ...fromSchedule]) {
      const instant = new Date(meeting.startTime).getTime();
      if (Number.isNaN(instant)) continue;
      const key = String(instant);
      if (!merged.has(key)) {
        merged.set(key, meeting);
      } else {
        merged.set(key, this.mergeMeetingViews(merged.get(key)!, meeting));
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, limit);
  }

  getNextFreeSlot(now: Date, date: string, slots: TimeSlotView[]): TimeSlotView | null {
    const nowMs = now.getTime();
    const futureSlot = slots.find((slot) => {
      if (slot.status !== 'available') return false;
      return new Date(slot.startTime).getTime() >= nowMs;
    });
    return futureSlot ?? null;
  }

  getNextAvailabilityLabel(now: Date, slots: TimeSlotView[]): string {
    if (this.isNowInOccupiedSlot(now, slots)) {
      const freeSlot = this.getNextFreeSlot(now, '', slots);
      return freeSlot ? this.formatIsoTime(freeSlot.startTime) : '—';
    }
    return 'Agora';
  }

  isNowInOccupiedSlot(now: Date, slots: TimeSlotView[]): boolean {
    const nowMs = now.getTime();
    return slots.some(
      (slot) =>
        slot.status === 'occupied' && isInstantInsideInterval(nowMs, slot.startTime, slot.endTime),
    );
  }

  formatIsoTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    });
  }

  formatIsoDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date
      .toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
      })
      .replace(',', '');
  }

  formatClock(date: Date): string {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    });
  }

  /** Arredonda para o início do bloco de 30 min (horário de Brasília). */
  formatTimeRoundedTo30Min(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const roundedMinute = minute < 30 ? 0 : 30;
    return `${String(hour).padStart(2, '0')}:${String(roundedMinute).padStart(2, '0')}`;
  }

  todayBrazil(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  private addMinutesIso(iso: string, minutes: number): string {
    const instant = new Date(iso).getTime();
    if (Number.isNaN(instant)) return iso;
    return this.toBrazilIsoFromDate(new Date(instant + minutes * 60_000));
  }

  private toBrazilIsoFromDate(date: Date): string {
    const parts = date.toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo', hour12: false }).split(', ');
    const datePart = parts[0];
    const timePart = (parts[1] ?? '00:00:00').slice(0, 8);
    return `${datePart}T${timePart}${BRAZIL_TIME_OFFSET}`;
  }

  private getNextDate(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    const base = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
    base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString().slice(0, 10);
  }

  private toBrazilIso(date: string, hour: number, minute = 0, second = 0): string {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const ss = String(second).padStart(2, '0');
    return `${date}T${hh}:${mm}:${ss}${BRAZIL_TIME_OFFSET}`;
  }

  formatMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private mergeMeetingViews(
    existing: UpcomingMeetingView,
    incoming: UpcomingMeetingView,
  ): UpcomingMeetingView {
    const startTime = existing.startTime;
    const endTime =
      new Date(incoming.endTime).getTime() > new Date(existing.endTime).getTime()
        ? incoming.endTime
        : existing.endTime;
    let title = existing.title;
    let organizer = existing.organizer;
    if (!organizer && incoming.organizer) organizer = incoming.organizer;
    if (title === 'Reunião' && incoming.title !== 'Reunião') title = incoming.title;
    return {
      time: this.formatIsoTime(startTime),
      title,
      organizer,
      startTime,
      endTime,
    };
  }

  private resolveBookedBy(
    startTime: string,
    endTime: string,
    scheduleItems: ScheduleItemDto[],
    roomBookings: BookingView[],
  ): string | undefined {
    const booking = roomBookings.find((item) => overlapsInterval(startTime, endTime, item.startTime, item.endTime));
    if (booking?.organizer?.trim()) return booking.organizer.trim();
    const scheduleItem = scheduleItems.find(
      (item) => isBusyScheduleStatus(item.status) && overlapsInterval(startTime, endTime, item.start, item.end),
    );
    if (scheduleItem?.subject?.trim()) return scheduleItem.subject.trim();
    return undefined;
  }
}
