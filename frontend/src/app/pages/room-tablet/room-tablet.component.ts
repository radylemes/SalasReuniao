import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, firstValueFrom, interval, timeout } from 'rxjs';
import { BookingFormComponent } from '../../components/booking-form/booking-form.component';
import { TimelineComponent } from '../../components/timeline/timeline.component';
import { TabletMeetingDetailComponent } from '../../components/tablet-meeting-detail/tablet-meeting-detail.component';
import { TabletPinDialogComponent } from '../../components/tablet-pin-dialog/tablet-pin-dialog.component';
import { TabletSettingsPanelComponent } from '../../components/tablet-settings-panel/tablet-settings-panel.component';
import { BookingSubmitPayload, BookingView, RoomView, TimeSlotView } from '../../models/ui.models';
import { RoomScheduleService, UpcomingMeetingView } from '../../services/room-schedule.service';
import { BookingDto, RoomDto, RoomsApiService, ScheduleItemDto } from '../../services/rooms-api.service';
import {
  TabletKioskConfig,
  TabletKioskConfigService,
} from '../../services/tablet-kiosk-config.service';
import { ToastService } from '../../services/toast.service';
import { TabletPendingCheckinService } from '../../services/tablet-pending-checkin.service';
import { environment } from '../../../environments/environment';

const MANUAL_OVERRIDE_PREFIX = 'kiosk-manual-occupied';
const DEFAULT_SCREENSAVER_IDLE_MS = 120_000;
const POLL_INTERVAL_MS = 30_000;
const POLL_INTERVAL_CHECKIN_MS = 15_000;
/** Tempo máximo entre cliques consecutivos antes de reiniciar o contador. */
const CORNER_CLICK_WINDOW_MS = 30_000;
const CORNER_CLICK_COUNT_REQUIRED = 3;

interface ApiErrorBody {
  code?: string;
  message?: string;
}

@Component({
  selector: 'app-room-tablet',
  standalone: true,
  imports: [
    CommonModule,
    BookingFormComponent,
    TimelineComponent,
    TabletMeetingDetailComponent,
    TabletPinDialogComponent,
    TabletSettingsPanelComponent,
  ],
  templateUrl: './room-tablet.component.html',
  styleUrl: './room-tablet.component.scss',
})
export class RoomTabletComponent implements OnInit, OnDestroy {
  localidade = '';
  roomEmail = '';
  room: RoomView | null = null;

  clock = '';
  displayStatus: 'available' | 'occupied' | 'awaiting_checkin' = 'available';
  statusTitle = 'Disponível';
  statusSubtitle = 'Sala pronta para uso';
  manualOverride = false;
  checkInModeEnabled = false;
  checkInGraceMinutes = 15;
  pendingCheckInBooking: BookingView | null = null;
  isCheckingIn = false;
  isAutoCancelling = false;
  checkInCountdownSeconds = 0;

  upcomingMeetings: UpcomingMeetingView[] = [];
  otherMeetings: UpcomingMeetingView[] = [];
  showFullAgenda = false;
  selectedMeeting: UpcomingMeetingView | null = null;

  occupancyPercent = 0;
  nextAvailability = '—';

  demoLocation = '';
  demoTemperature = 22;
  demoTemperatureTarget = 22;

  slots: TimeSlotView[] = [];
  selectedSlot: TimeSlotView | null = null;
  showBookingForm = false;
  showPinPrompt = false;
  showSettings = false;
  kioskConfigSnapshot: TabletKioskConfig;
  isLoading = true;
  isBooking = false;
  loadError = '';
  isScreensaverActive = false;

  private readonly screensaverIdleMs =
    (environment.kiosk as { screensaverIdleMs?: number }).screensaverIdleMs ?? DEFAULT_SCREENSAVER_IDLE_MS;
  private scheduleItems: ScheduleItemDto[] = [];
  private roomBookings: BookingView[] = [];
  private selectedDate = '';
  private pollSub?: Subscription;
  private clockSub?: Subscription;
  private countdownSub?: Subscription;
  private configSub?: Subscription;
  private autoCancelEventId: string | null = null;
  private visibilityHandler = () => this.onVisibilityChange();
  private cornerClickCount = 0;
  private lastCornerClickAt = 0;
  private idleTimeoutId?: ReturnType<typeof setTimeout>;
  private readonly onUserActivity = () => this.resetIdleTimer();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: RoomsApiService,
    private readonly schedule: RoomScheduleService,
    private readonly kioskConfig: TabletKioskConfigService,
    private readonly cdr: ChangeDetectorRef,
    private readonly toast: ToastService,
    private readonly tabletPendingCheckin: TabletPendingCheckinService,
  ) {
    this.kioskConfigSnapshot = this.kioskConfig.getConfig();
  }

  ngOnInit(): void {
    this.resolveRoomFromRouteOrConfig();
    this.applyKioskConfig(this.kioskConfig.getConfig());

    if (!this.roomEmail) {
      this.loadError = 'Sala não configurada. Defina roomEmail na rota ou no menu de configuração.';
      this.isLoading = false;
      return;
    }

    this.configSub = this.kioskConfig.config$.subscribe((config) => {
      const prevCheckIn = this.checkInModeEnabled;
      const prevGrace = this.checkInGraceMinutes;
      this.applyKioskConfig(config);
      if (config.checkInModeEnabled !== prevCheckIn) {
        this.restartPolling();
      }
      if (config.checkInGraceMinutes !== prevGrace) {
        this.syncCheckInCountdown();
      }
      this.cdr.markForCheck();
    });

    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.bindIdleTracking();
    this.clockSub = interval(30_000).subscribe(() => this.updateClock());
    this.startPolling();
    this.updateClock();
    void this.refreshData();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.unbindIdleTracking();
    this.pollSub?.unsubscribe();
    this.clockSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
    this.configSub?.unsubscribe();
  }

  onCornerClick(): void {
    const now = Date.now();
    if (this.cornerClickCount > 0 && now - this.lastCornerClickAt > CORNER_CLICK_WINDOW_MS) {
      this.cornerClickCount = 0;
    }
    this.cornerClickCount++;
    this.lastCornerClickAt = now;

    if (this.cornerClickCount >= CORNER_CLICK_COUNT_REQUIRED) {
      this.cornerClickCount = 0;
      this.showPinPrompt = true;
      this.resetIdleTimer();
      this.cdr.detectChanges();
    }
  }

  onPinConfirmed(): void {
    this.showPinPrompt = false;
    this.kioskConfigSnapshot = this.kioskConfig.getConfig();
    this.showSettings = true;
    this.resetIdleTimer();
    this.cdr.detectChanges();
  }

  closePinPrompt(): void {
    this.showPinPrompt = false;
    this.cornerClickCount = 0;
    this.resetIdleTimer();
  }

  closeSettings(): void {
    this.showSettings = false;
    this.resetIdleTimer();
  }

  async onSettingsSaved(config: TabletKioskConfig): Promise<void> {
    this.showSettings = false;
    const prevLocalidade = this.localidade;
    const prevRoomEmail = this.roomEmail;
    const prevCheckInMode = this.checkInModeEnabled;

    this.localidade = config.localidade;
    this.roomEmail = config.roomEmail;
    this.applyKioskConfig(config);

    if (config.localidade !== prevLocalidade || config.roomEmail !== prevRoomEmail) {
      const target = ['/tablet', config.localidade, encodeURIComponent(config.roomEmail)];
      await this.router.navigate(target, { replaceUrl: true });
    }

    if (config.checkInModeEnabled !== prevCheckInMode) {
      this.restartPolling();
    }

    this.room = null;
    await this.refreshData();
    this.toast.success('Configuração guardada.');
  }

  async onCheckIn(): Promise<void> {
    const booking = this.pendingCheckInBooking;
    if (!booking || this.isCheckingIn) return;

    this.isCheckingIn = true;
    const organizer = booking.organizer?.includes('@') ? booking.organizer.trim() : undefined;
    try {
      await this.awaitWithTimeout(
        this.api.checkInBooking(this.localidade, booking.eventId, {
          organizer,
          roomEmail: this.roomEmail || booking.roomEmail,
        }),
      );
      this.tabletPendingCheckin.markCheckedIn(booking.eventId);
      this.toast.success('Check-in confirmado.');
      await this.refreshData();
    } catch (error) {
      const message = this.toErrorMessage(error, 'Não foi possível confirmar o check-in.');
      this.toast.error(message);
    } finally {
      this.isCheckingIn = false;
      this.cdr.detectChanges();
    }
  }

  get isOccupied(): boolean {
    return this.displayStatus === 'occupied';
  }

  get showCheckInButton(): boolean {
    return this.checkInModeEnabled && this.pendingCheckInBooking !== null;
  }

  get checkInButtonLabel(): string {
    if (this.isCheckingIn) return 'A confirmar…';
    if (this.isAutoCancelling) return 'A cancelar…';
    const countdown = this.formatCountdown(this.checkInCountdownSeconds);
    return countdown ? `Check-IN · ${countdown}` : 'Check-IN';
  }

  get showManualOccupiedButton(): boolean {
    return !this.checkInModeEnabled;
  }

  get nextMeeting(): UpcomingMeetingView | null {
    return this.upcomingMeetings[0] ?? null;
  }

  get temperaturePercent(): number {
    const min = 16;
    const max = 28;
    return ((this.demoTemperature - min) / (max - min)) * 100;
  }

  get screensaverTickerText(): string {
    const name = this.room?.name?.trim() || 'Sala';
    return `${name}   ·   ${this.demoTemperature}°C`;
  }

  get occupancyBadgeClass(): string {
    if (this.occupancyPercent >= 80) return 'badge-occupied';
    if (this.occupancyPercent >= 50) return 'badge-almost-full';
    return 'badge-available';
  }

  get agendaSlots(): TimeSlotView[] {
    return this.schedule.getBookableSlots(this.slots, new Date(), this.selectedDate);
  }

  toggleManualOccupied(): void {
    if (this.manualOverride) {
      this.clearManualOverride();
    } else {
      this.setManualOverride();
    }
    this.applyDisplayStatus();
    this.cdr.detectChanges();
  }

  closeBooking(): void {
    this.showBookingForm = false;
    this.selectedSlot = null;
    this.resetIdleTimer();
  }

  openFullAgenda(): void {
    this.showFullAgenda = true;
    this.resetIdleTimer();
  }

  closeFullAgenda(): void {
    this.showFullAgenda = false;
    this.resetIdleTimer();
  }

  openMeetingDetail(meeting: UpcomingMeetingView): void {
    this.selectedMeeting = meeting;
    this.resetIdleTimer();
  }

  closeMeetingDetail(): void {
    this.selectedMeeting = null;
    this.resetIdleTimer();
  }

  dismissScreensaver(): void {
    this.resetIdleTimer();
  }

  onAgendaSlotSelect(slot: TimeSlotView): void {
    this.closeFullAgenda();
    this.selectedSlot = slot;
    this.showBookingForm = true;
    this.resetIdleTimer();
  }

  async onSubmitBooking(payload: BookingSubmitPayload): Promise<void> {
    if (!this.room || this.isBooking) return;
    this.isBooking = true;
    try {
      if (this.checkInModeEnabled) {
        await this.awaitWithTimeout(
          this.api.putKioskSettings(this.localidade, this.room.email, {
            checkInModeEnabled: true,
            checkInGraceMinutes: this.checkInGraceMinutes,
          }),
        );
      }

      const result = await this.awaitWithTimeout(
        this.api.bookRoom(
          this.localidade,
          this.room.email,
          payload.title,
          payload.startTime,
          payload.endTime,
          payload.requesterEmail,
          payload.participants,
          payload.allowRequesterConflict,
        ),
      );

      if (this.checkInModeEnabled && result.eventId) {
        this.tabletPendingCheckin.save({
          eventId: result.eventId,
          roomEmail: this.room.email,
          roomName: this.room.name,
          title: payload.title.trim(),
          startTime: payload.startTime,
          endTime: payload.endTime,
          organizer: payload.requesterEmail,
          requiresCheckIn: true,
          checkedIn: false,
        });
      }

      this.showBookingForm = false;
      this.selectedSlot = null;
      this.toast.success('Reserva criada com sucesso.');
      await this.refreshData();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = this.toErrorMessage(
        error,
        status === 409
          ? 'Este horário não está mais disponível. Tente outro horário.'
          : 'Erro inesperado ao reservar sala.',
      );
      this.toast.error(message);
    } finally {
      this.isBooking = false;
    }
  }

  private resolveRoomFromRouteOrConfig(): void {
    const config = this.kioskConfig.getConfig();
    const routeLocalidade = this.route.snapshot.paramMap.get('localidade');
    const encodedEmail = this.route.snapshot.paramMap.get('roomEmail') ?? '';

    this.localidade = routeLocalidade ?? config.localidade ?? 'WTorre';
    this.roomEmail = encodedEmail ? decodeURIComponent(encodedEmail) : config.roomEmail;
  }

  private async syncCheckInModeFromServer(): Promise<void> {
    if (!this.localidade || !this.roomEmail) return;

    const localEnabled = this.kioskConfig.getConfig().checkInModeEnabled;
    try {
      const server = await this.awaitWithTimeout(
        this.api.getKioskSettings(this.localidade, this.roomEmail),
      );

      const serverGrace = this.kioskConfig.normalizeGraceMinutes(server.checkInGraceMinutes);
      const localGrace = this.kioskConfig.getConfig().checkInGraceMinutes;

      if (server.checkInModeEnabled && !localEnabled) {
        this.kioskConfig.saveConfig({ checkInModeEnabled: true, checkInGraceMinutes: serverGrace });
        this.checkInModeEnabled = true;
        this.checkInGraceMinutes = serverGrace;
        this.restartPolling();
        return;
      }

      if (serverGrace !== localGrace) {
        this.kioskConfig.saveConfig({ checkInGraceMinutes: serverGrace });
        this.checkInGraceMinutes = serverGrace;
      }

      if (localEnabled && !server.checkInModeEnabled) {
        await this.awaitWithTimeout(
          this.api.putKioskSettings(this.localidade, this.roomEmail, {
            checkInModeEnabled: true,
            checkInGraceMinutes: localGrace,
          }),
        );
      }

      this.checkInModeEnabled = localEnabled;
    } catch {
      this.checkInModeEnabled = localEnabled;
    }
  }

  private applyKioskConfig(config: TabletKioskConfig): void {
    this.kioskConfigSnapshot = { ...config };
    this.demoLocation = config.demoLocation;
    this.demoTemperature = config.demoTemperature;
    this.demoTemperatureTarget = config.demoTemperatureTarget;
    this.checkInModeEnabled = config.checkInModeEnabled;
    this.checkInGraceMinutes = config.checkInGraceMinutes;
  }

  private async refreshData(): Promise<void> {
    this.selectedDate = this.schedule.todayBrazil();
    this.isLoading = !this.room;
    this.loadError = '';
    try {
      const roomsResponse = await this.awaitWithTimeout(this.api.getRooms(this.localidade));
      const roomDto = roomsResponse.rooms.find((r) => r.email === this.roomEmail);
      if (!roomDto) {
        this.loadError = 'Sala não encontrada nesta localidade.';
        return;
      }
      this.room = this.toRoom(this.localidade, roomDto);

      await this.syncCheckInModeFromServer();

      const { start, end } = this.schedule.buildDayRange(this.selectedDate);
      const [scheduleResponse, bookingsResponse] = await Promise.all([
        this.awaitWithTimeout(this.api.checkSchedule(this.localidade, [this.roomEmail], start, end)),
        this.awaitWithTimeout(this.api.listBookings(this.localidade, start, end)),
      ]);

      this.scheduleItems = scheduleResponse.schedule[0]?.scheduleItems ?? [];
      const roomEmailLower = this.roomEmail.toLowerCase();
      const apiBookings = bookingsResponse.bookings
        .filter((b) => b.roomEmail.toLowerCase() === roomEmailLower)
        .map((b) => this.toBooking(b));

      const now = new Date();
      this.roomBookings = this.tabletPendingCheckin.mergeWithBookings(
        this.roomEmail,
        apiBookings,
        now,
      );
      this.slots = this.schedule.buildTimeSlots(this.selectedDate, this.scheduleItems, this.roomBookings);
      this.manualOverride = this.checkInModeEnabled ? false : this.readManualOverride();
      this.upcomingMeetings = this.schedule.getUpcomingMeetings(now, this.scheduleItems, this.roomBookings);
      this.otherMeetings = this.upcomingMeetings.slice(1, 3);
      const roomSchedule = scheduleResponse.schedule[0];
      this.occupancyPercent = roomSchedule
        ? this.schedule.getOccupancyPercent(this.selectedDate, roomSchedule)
        : 0;
      this.nextAvailability = this.schedule.getNextAvailabilityLabel(now, this.slots);
      this.applyDisplayStatus();
      this.resetIdleTimer();
    } catch (error) {
      this.loadError = this.toErrorMessage(error, 'Erro ao carregar dados da sala.');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private applyDisplayStatus(): void {
    const now = new Date();
    if (!this.checkInModeEnabled && this.manualOverride) {
      this.displayStatus = 'occupied';
      this.statusTitle = 'Ocupada';
      this.statusSubtitle = 'Marcada manualmente no tablet';
      this.pendingCheckInBooking = null;
      return;
    }

    let current = this.schedule.getCurrentStatus(
      now,
      this.scheduleItems,
      this.roomBookings,
      this.checkInModeEnabled,
    );

    if (this.checkInModeEnabled && !current.pendingCheckInBooking) {
      const fallback =
        this.schedule.findPendingCheckInBooking(now, this.scheduleItems, this.roomBookings) ??
        this.tabletPendingCheckin.findActive(this.roomEmail, now);
      if (fallback) {
        const title = fallback.title?.trim() || fallback.organizer?.trim() || 'Reserva agendada';
        current = {
          status: 'awaiting_checkin',
          subtitle: `Aguardando check-in — ${title}`,
          currentMeetingTitle: title,
          pendingCheckInBooking: fallback,
        };
      }
    }

    this.displayStatus = current.status;
    const prevEventId = this.pendingCheckInBooking?.eventId;
    this.pendingCheckInBooking = current.pendingCheckInBooking ?? null;
    if (this.pendingCheckInBooking?.eventId !== prevEventId) {
      this.autoCancelEventId = null;
    }

    if (this.displayStatus === 'occupied') {
      this.statusTitle = 'Ocupada';
    } else if (this.displayStatus === 'awaiting_checkin') {
      this.statusTitle = 'Aguardando check-in';
    } else {
      this.statusTitle = 'Disponível';
    }
    this.statusSubtitle = current.subtitle;
    this.syncCheckInCountdown();
  }

  private getCheckInDeadlineMs(booking: BookingView): number | null {
    const startMs = new Date(booking.startTime).getTime();
    if (Number.isNaN(startMs)) return null;
    return startMs + this.checkInGraceMinutes * 60_000;
  }

  private formatCountdown(totalSeconds: number): string {
    if (totalSeconds <= 0) return '00:00';
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  private syncCheckInCountdown(): void {
    const booking = this.pendingCheckInBooking;
    if (!this.showCheckInButton || !booking) {
      this.checkInCountdownSeconds = 0;
      this.stopCountdownTicker();
      return;
    }

    const deadline = this.getCheckInDeadlineMs(booking);
    if (deadline === null) {
      this.checkInCountdownSeconds = 0;
      this.stopCountdownTicker();
      return;
    }

    const remainingMs = deadline - Date.now();
    this.checkInCountdownSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

    if (remainingMs <= 0 && this.autoCancelEventId !== booking.eventId && !this.isAutoCancelling) {
      void this.performAutoCancel(booking.eventId);
    } else {
      this.startCountdownTicker();
    }
  }

  private startCountdownTicker(): void {
    if (this.countdownSub) return;
    this.countdownSub = interval(1000).subscribe(() => {
      this.syncCheckInCountdown();
      this.cdr.markForCheck();
    });
  }

  private stopCountdownTicker(): void {
    this.countdownSub?.unsubscribe();
    this.countdownSub = undefined;
  }

  private async performAutoCancel(eventId: string): Promise<void> {
    if (this.isAutoCancelling || this.autoCancelEventId === eventId) return;
    this.autoCancelEventId = eventId;
    this.isAutoCancelling = true;
    this.cdr.detectChanges();

    const booking = this.pendingCheckInBooking;
    const organizer = booking?.organizer?.includes('@') ? booking.organizer.trim() : undefined;

    try {
      await this.awaitWithTimeout(
        this.api.cancelBooking(this.localidade, eventId, {
          organizer,
          roomEmail: this.roomEmail || booking?.roomEmail,
          start: booking?.startTime,
          end: booking?.endTime,
          title: booking?.title,
        }),
      );
      this.tabletPendingCheckin.clear();
      this.toast.info('Reserva cancelada por falta de check-in.');
      await this.refreshData();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        this.tabletPendingCheckin.clear();
        await this.refreshData();
        return;
      }
      this.autoCancelEventId = null;
      const message = this.toErrorMessage(error, 'Não foi possível cancelar a reserva automaticamente.');
      this.toast.error(message);
    } finally {
      this.isAutoCancelling = false;
      this.cdr.detectChanges();
    }
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    const intervalMs = this.checkInModeEnabled ? POLL_INTERVAL_CHECKIN_MS : POLL_INTERVAL_MS;
    this.pollSub = interval(intervalMs).subscribe(() => void this.refreshData());
  }

  private restartPolling(): void {
    this.startPolling();
  }

  private updateClock(): void {
    this.clock = this.schedule.formatClock(new Date());
    this.cdr.markForCheck();
  }

  private onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.updateClock();
      void this.refreshData();
      this.resetIdleTimer();
    }
  }

  private bindIdleTracking(): void {
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'touchstart', 'keydown'];
    for (const event of events) {
      document.addEventListener(event, this.onUserActivity, { passive: true });
    }
    this.resetIdleTimer();
  }

  private unbindIdleTracking(): void {
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'touchstart', 'keydown'];
    for (const event of events) {
      document.removeEventListener(event, this.onUserActivity);
    }
    clearTimeout(this.idleTimeoutId);
  }

  private resetIdleTimer(): void {
    if (this.isScreensaverActive) {
      this.isScreensaverActive = false;
    }

    clearTimeout(this.idleTimeoutId);

    if (this.shouldPauseScreensaver()) {
      this.cdr.markForCheck();
      return;
    }

    this.idleTimeoutId = setTimeout(() => this.activateScreensaver(), this.screensaverIdleMs);
    this.cdr.markForCheck();
  }

  private shouldPauseScreensaver(): boolean {
    return (
      !this.room ||
      this.isLoading ||
      !!this.loadError ||
      this.showPinPrompt ||
      this.showSettings ||
      this.showFullAgenda ||
      this.showBookingForm
    );
  }

  private activateScreensaver(): void {
    if (this.shouldPauseScreensaver()) return;
    this.isScreensaverActive = true;
    this.cdr.detectChanges();
  }

  private overrideKey(): string {
    return `${MANUAL_OVERRIDE_PREFIX}:${this.roomEmail}:${this.selectedDate}`;
  }

  private readManualOverride(): boolean {
    try {
      return localStorage.getItem(this.overrideKey()) === '1';
    } catch {
      return false;
    }
  }

  private setManualOverride(): void {
    try {
      localStorage.setItem(this.overrideKey(), '1');
      this.manualOverride = true;
    } catch {
      /* ignore */
    }
  }

  private clearManualOverride(): void {
    try {
      localStorage.removeItem(this.overrideKey());
      this.manualOverride = false;
    } catch {
      /* ignore */
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
      requiresCheckIn: booking.requiresCheckIn,
      checkedIn: booking.checkedIn,
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
