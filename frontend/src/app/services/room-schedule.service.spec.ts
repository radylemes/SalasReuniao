import { TestBed } from '@angular/core/testing';
import { BookingView } from '../models/ui.models';
import { RoomScheduleService } from './room-schedule.service';
import { ScheduleItemDto } from './rooms-api.service';

describe('RoomScheduleService', () => {
  let service: RoomScheduleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoomScheduleService);
  });

  describe('formatIsoTime', () => {
    it('converte UTC para horário de Brasília', () => {
      expect(service.formatIsoTime('2026-05-16T01:30:00Z')).toBe('22:30');
    });

    it('mantém horário quando ISO já está em -03:00', () => {
      expect(service.formatIsoTime('2026-05-15T22:30:00-03:00')).toBe('22:30');
    });

    it('retorna placeholder para ISO inválido', () => {
      expect(service.formatIsoTime('invalid')).toBe('--:--');
    });
  });

  describe('formatIsoDateTime', () => {
    it('formata data e hora em Brasília a partir de UTC', () => {
      expect(service.formatIsoDateTime('2026-05-16T01:30:00Z')).toBe('15/05/2026 22:30');
    });

    it('formata data e hora quando ISO está em -03:00', () => {
      expect(service.formatIsoDateTime('2026-05-15T22:30:00-03:00')).toBe('15/05/2026 22:30');
    });
  });

  describe('getUpcomingMeetings', () => {
    const now = new Date('2026-05-15T12:00:00-03:00');

    const bookingUtc: BookingView = {
      eventId: 'evt-1',
      roomEmail: 'sala@test.com',
      roomName: 'Sala Teste',
      title: 'Reunião',
      startTime: '2026-05-16T01:30:00Z',
      endTime: '2026-05-16T02:30:00Z',
      organizer: 'Maria Silva',
    };

    const scheduleBrt: ScheduleItemDto = {
      start: '2026-05-15T22:30:00-03:00',
      end: '2026-05-15T23:30:00-03:00',
      status: 'busy',
      subject: 'Reunião de projeto',
    };

    it('funde o mesmo instante com formatos ISO diferentes', () => {
      const meetings = service.getUpcomingMeetings(now, [scheduleBrt], [bookingUtc]);

      expect(meetings).toHaveLength(1);
      expect(meetings[0].time).toBe('22:30');
    });

    it('prefere título descritivo e organizador ao fundir duplicatas', () => {
      const meetings = service.getUpcomingMeetings(now, [scheduleBrt], [bookingUtc]);

      expect(meetings[0].title).toBe('Reunião de projeto');
      expect(meetings[0].organizer).toBe('Maria Silva');
    });

    it('não inclui reuniões já iniciadas ou no passado', () => {
      const pastBooking: BookingView = {
        ...bookingUtc,
        startTime: '2026-05-15T08:00:00-03:00',
        endTime: '2026-05-15T09:00:00-03:00',
      };

      const meetings = service.getUpcomingMeetings(now, [], [pastBooking]);

      expect(meetings).toHaveLength(0);
    });
  });
});
