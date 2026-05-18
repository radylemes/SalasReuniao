import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';
import { BookingsListComponent } from '../../components/bookings-list/bookings-list.component';
import { HeaderComponent } from '../../components/header/header.component';
import { RoomCardComponent } from '../../components/room-card/room-card.component';
import { RoomDetailsComponent } from '../../components/room-details/room-details.component';
import { TimelineComponent } from '../../components/timeline/timeline.component';
import { HeaderTab } from '../../components/header/header.component';
import { BookingSubmitPayload, BookingView, RoomView, TimeSlotView } from '../../models/ui.models';
import { BookingDto, RoomDto, RoomsApiService } from '../../services/rooms-api.service';
import { RoomScheduleService } from '../../services/room-schedule.service';
import { ToastService } from '../../services/toast.service';

/** Localidades usadas na API (x-localidade). Carregamos salas e reservas de todas. */
const API_LOCATIONS = ['Allianz', 'WTorre'] as const;
const DOMAIN_ALLIANZ_PARQUE = 'allianzparque.com.br';
const DOMAIN_WTORRE = 'wtorre.com.br';
const DOMAIN_NOVO_ANHANGABAU = 'novoanhangabau.com.br';

/** Corpo de erro retornado pela API (ex.: 409 Conflict). */
interface ApiErrorBody {
  code?: string;
  message?: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    RoomCardComponent,
    RoomDetailsComponent,
    TimelineComponent,
    BookingsListComponent,
    BookingFormComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  selectedDate = new Date().toISOString().slice(0, 10);
  activeTab: HeaderTab = 'allianzparque';

  selectedRoom: RoomView | null = null;
  selectedSlot: TimeSlotView | null = null;
  showBookingForm = false;

  rooms: RoomView[] = [];
  bookings: BookingView[] = [];
  slots: TimeSlotView[] = [];

  isLoadingRooms = false;
  isLoadingBookings = false;
  isLoadingSlots = false;
  isBooking = false;
  private isRefreshingDashboard = false;
  private queuedRefresh = false;

  constructor(
    private readonly api: RoomsApiService,
    private readonly roomSchedule: RoomScheduleService,
    private readonly cdr: ChangeDetectorRef,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    setTimeout(() => {
      void this.onRefresh();
    }, 0);
  }

  /** Salas cujo e-mail tem domínio allianzparque.com.br */
  get roomsAllianzParque(): RoomView[] {
    return this.rooms.filter(
      (room) => room.email && room.email.toLowerCase().includes(DOMAIN_ALLIANZ_PARQUE),
    );
  }

  /** Salas cujo e-mail tem domínio wtorre.com.br */
  get roomsWtorre(): RoomView[] {
    return this.rooms.filter(
      (room) => room.email && room.email.toLowerCase().includes(DOMAIN_WTORRE),
    );
  }

  /** Salas cujo e-mail tem domínio novoanhangabau.com.br */
  get roomsNovoAnhangabau(): RoomView[] {
    return this.rooms.filter(
      (room) => room.email && room.email.toLowerCase().includes(DOMAIN_NOVO_ANHANGABAU),
    );
  }

  /** Salas da aba atual (por domínio) */
  get bookableSlots(): TimeSlotView[] {
    return this.roomSchedule.getBookableSlots(this.slots, new Date(), this.selectedDate);
  }

  get roomsForCurrentTab(): RoomView[] {
    switch (this.activeTab) {
      case 'allianzparque':
        return this.roomsAllianzParque;
      case 'wtorre':
        return this.roomsWtorre;
      case 'novoanhangabau':
        return this.roomsNovoAnhangabau;
      default:
        return [];
    }
  }

  /** Reservas filtradas pela aba atual (por domínio do roomEmail). Na aba Reservas, todas. */
  get bookingsForCurrentTab(): BookingView[] {
    switch (this.activeTab) {
      case 'allianzparque':
        return this.bookings.filter(
          (b) => b.roomEmail && b.roomEmail.toLowerCase().includes(DOMAIN_ALLIANZ_PARQUE),
        );
      case 'wtorre':
        return this.bookings.filter(
          (b) => b.roomEmail && b.roomEmail.toLowerCase().includes(DOMAIN_WTORRE),
        );
      case 'novoanhangabau':
        return this.bookings.filter(
          (b) => b.roomEmail && b.roomEmail.toLowerCase().includes(DOMAIN_NOVO_ANHANGABAU),
        );
      case 'reservas':
        return this.bookings;
      default:
        return this.bookings;
    }
  }

  onTabChange(tab: HeaderTab): void {
    this.activeTab = tab;
    this.selectedRoom = null;
    this.selectedSlot = null;
    this.showBookingForm = false;
    this.slots = [];
  }

  async onDateChange(date: string): Promise<void> {
    this.selectedDate = date;
    this.selectedSlot = null;
    this.showBookingForm = false;
    await this.loadDashboardData();
    if (this.selectedRoom) {
      await this.syncSelectedRoomSlots();
    }
  }

  async onRefresh(): Promise<void> {
    if (this.isRefreshingDashboard) {
      this.queuedRefresh = true;
      return;
    }

    this.isRefreshingDashboard = true;
    try {
      await this.loadDashboardData();
    } finally {
      this.isRefreshingDashboard = false;
      if (this.queuedRefresh) {
        this.queuedRefresh = false;
        void this.onRefresh();
      }
    }
  }

  onRoomSelect(roomId: string): void {
    const room = this.rooms.find((item) => item.id === roomId);
    if (!room) return;
    this.selectedRoom = room;
    this.selectedSlot = null;
    this.slots = [];
    this.cdr.detectChanges();
    void this.syncSelectedRoomSlots();
  }

  onBackToRooms(): void {
    this.selectedRoom = null;
    this.selectedSlot = null;
  }

  onSlotSelect(slot: TimeSlotView): void {
    this.selectedSlot = slot;
    this.showBookingForm = true;
  }

  onCloseBookingForm(): void {
    this.showBookingForm = false;
    this.selectedSlot = null;
  }

  async onSubmitBooking(payload: BookingSubmitPayload): Promise<void> {
    if (!this.selectedRoom || !this.selectedSlot) return;
    if (this.isBooking) return;
    this.isBooking = true;
    const localidade = this.selectedRoom.location;
    try {
      await this.awaitWithTimeout(
        this.api.bookRoom(
          localidade,
          this.selectedRoom.email,
          payload.title,
          payload.startTime,
          payload.endTime,
          payload.requesterEmail,
          payload.participants,
          payload.allowRequesterConflict,
        ),
      );
      const updatedBookings = await this.loadAllBookings(this.selectedDate);
      await this.loadAllRooms(this.selectedDate);
      await this.loadSelectedRoomSlots(localidade, this.selectedRoom, this.selectedDate, updatedBookings);
      this.showBookingForm = false;
      this.selectedSlot = null;
      this.selectedRoom = null;
      this.toast.success('Reserva criada com sucesso.');
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const apiCode = (error as { error?: ApiErrorBody })?.error?.code;
      let fallback =
        status === 409
          ? 'Este horário não está mais disponível. Tente outro horário ou atualize a página.'
          : 'Erro inesperado ao reservar sala.';
      if (apiCode === 'PARTICIPANT_CONFLICT') {
        fallback =
          'A agenda de outro participante está ocupada neste horário. Escolha outro horário ou remova participantes em conflito.';
      } else if (apiCode === 'REQUESTER_CONFLICT') {
        fallback =
          'O solicitante já possui compromisso neste horário. Confirme novamente se deseja agendar.';
      } else if (apiCode === 'ROOM_CONFLICT') {
        fallback = 'A sala selecionada não está disponível neste horário. Escolha outro horário na grade.';
      }
      const message = this.toErrorMessage(error, fallback);
      this.toast.error(message);
      if (status === 409 && this.selectedRoom) {
        await this.syncSelectedRoomSlots();
      }
    } finally {
      this.isBooking = false;
    }
  }

  private async loadDashboardData(): Promise<void> {
    let firstError = '';

    try {
      await this.loadAllRooms(this.selectedDate);
    } catch (error) {
      firstError = this.toErrorMessage(error, 'Erro inesperado ao carregar salas.');
    }

    try {
      await this.loadAllBookings(this.selectedDate);
    } catch (error) {
      if (!firstError) {
        firstError = this.toErrorMessage(error, 'Erro inesperado ao carregar reservas.');
      }
    }

    if (this.selectedRoom) {
      await this.syncSelectedRoomSlots();
    }

    if (firstError) {
      this.toast.error(firstError);
    }

    this.cdr.detectChanges();
  }

  /** Carrega salas de todas as localidades da API e mescla em this.rooms */
  private async loadAllRooms(date: string): Promise<void> {
    this.isLoadingRooms = true;
    try {
      const allRooms: RoomView[] = [];
      for (const loc of API_LOCATIONS) {
        await this.loadRoomsWithStatus(loc, date, allRooms);
      }
      this.rooms = allRooms;
      if (this.selectedRoom) {
        this.selectedRoom = allRooms.find((room) => room.id === this.selectedRoom?.id) ?? null;
      }
    } finally {
      this.isLoadingRooms = false;
    }
  }

  /** Carrega reservas de todas as localidades e mescla em this.bookings */
  private async loadAllBookings(date: string): Promise<BookingView[]> {
    this.isLoadingBookings = true;
    try {
      const allBookings: BookingView[] = [];
      for (const loc of API_LOCATIONS) {
        const list = await this.loadBookings(loc, date);
        allBookings.push(...list);
      }
      this.bookings = allBookings;
      return allBookings;
    } finally {
      this.isLoadingBookings = false;
    }
  }

  private async loadBookings(localidade: string, date: string): Promise<BookingView[]> {
    const { start, end } = this.roomSchedule.buildDayRange(date);
    const response = await this.awaitWithTimeout(this.api.listBookings(localidade, start, end));
    return response.bookings.map((booking) => this.toBooking(booking));
  }

  private async loadRoomsWithStatus(localidade: string, date: string, outRooms?: RoomView[]): Promise<void> {
    const roomsResponse = await this.awaitWithTimeout(this.api.getRooms(localidade));
    const mappedRooms = roomsResponse.rooms.map((room) => this.toRoom(localidade, room));
    if (mappedRooms.length === 0) return;

    const { start, end } = this.roomSchedule.buildDayRange(date);
    const scheduleResponse = await this.awaitWithTimeout(
      this.api.checkSchedule(
        localidade,
        mappedRooms.map((room) => room.email),
        start,
        end,
      ),
    );

    const byRoom = new Map(scheduleResponse.schedule.map((entry) => [entry.roomEmail, entry]));
    const roomsWithStatus = mappedRooms.map((room) => {
      const roomSchedule = byRoom.get(room.email);
      const occupancyPercent = this.roomSchedule.getOccupancyPercent(date, roomSchedule);
      return {
        ...room,
        status: occupancyPercent >= 100 ? 'occupied' : 'available',
        occupancyPercent,
      } as RoomView;
    });

    if (outRooms) {
      outRooms.push(...roomsWithStatus);
    } else {
      this.rooms = roomsWithStatus;
      if (this.selectedRoom) {
        this.selectedRoom = roomsWithStatus.find((room) => room.id === this.selectedRoom?.id) ?? null;
      }
    }
  }

  private async loadSelectedRoomSlots(
    localidade: string,
    room: RoomView,
    date: string,
    currentBookings: BookingView[],
  ): Promise<void> {
    this.isLoadingSlots = true;
    this.slots = [];
    this.cdr.detectChanges();
    try {
      const { start, end } = this.roomSchedule.buildDayRange(date);
      const response = await this.awaitWithTimeout(this.api.checkSchedule(localidade, [room.email], start, end));
      const firstSchedule = response.schedule[0];
      const roomBookings = currentBookings.filter((booking) => booking.roomEmail === room.email);
      const updatedSlots = this.roomSchedule.buildTimeSlots(date, firstSchedule?.scheduleItems ?? [], roomBookings);
      this.slots = updatedSlots;
      if (this.selectedSlot) {
        this.selectedSlot =
          updatedSlots.find(
            (slot) => slot.startTime === this.selectedSlot?.startTime && slot.endTime === this.selectedSlot?.endTime,
          ) ?? null;
      }
      this.cdr.detectChanges();
    } finally {
      this.isLoadingSlots = false;
      this.cdr.detectChanges();
    }
  }

  async syncSelectedRoomSlots(): Promise<void> {
    if (!this.selectedRoom) {
      this.slots = [];
      return;
    }
    try {
      await this.loadSelectedRoomSlots(this.selectedRoom.location, this.selectedRoom, this.selectedDate, this.bookings);
    } catch (error) {
      const msg = this.toErrorMessage(error, 'Erro inesperado ao consultar agenda da sala.');
      this.toast.error(msg);
    }
  }

  private toRoom(localidade: string, room: RoomDto): RoomView {
    return {
      id: room.email,
      name: room.name,
      email: room.email,
      capacity: room.capacity ?? 0,
      location: localidade,
      status: 'available',
      occupancyPercent: 0,
    };
  }

  private toBooking(booking: BookingDto): BookingView {
    return {
      eventId: booking.eventId,
      roomEmail: booking.roomEmail,
      roomName: booking.roomName,
      title: booking.title,
      startTime: booking.start,
      endTime: booking.end,
      organizer: booking.organizer,
    };
  }

  private toErrorMessage(error: unknown, fallback: string): string {
    const err = error as { error?: ApiErrorBody | string; message?: string } | null;
    if (!err) return fallback;
    const body = err.error;
    if (body != null) {
      const msg = typeof body === 'string' ? body : (body as ApiErrorBody).message;
      if (msg?.trim()) return msg.trim();
    }
    if (err.message?.trim()) return err.message.trim();
    return fallback;
  }

  private awaitWithTimeout<T>(source: Observable<T>): Promise<T> {
    return firstValueFrom(source.pipe(timeout({ first: 20000 })));
  }
}
