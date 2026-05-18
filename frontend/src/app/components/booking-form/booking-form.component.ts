import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom, switchMap, timeout } from 'rxjs';
import { catchError, of } from 'rxjs';
import { BookingSubmitPayload, TimeSlotView } from '../../models/ui.models';
import {
  AvailabilityItemDto,
  AvailabilityPreviewDto,
  DirectoryUserDto,
  RoomsApiService,
} from '../../services/rooms-api.service';
import { blocksBooking } from '../../utils/schedule-overlap';
import { RoomScheduleService } from '../../services/room-schedule.service';

interface EndOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking-form.component.html',
  styleUrl: './booking-form.component.scss',
})
export class BookingFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) localidade = '';
  @Input({ required: true }) roomName = '';
  @Input({ required: true }) roomEmail = '';
  @Input() roomCapacity?: number;
  @Input({ required: true }) selectedSlot: TimeSlotView | null = null;
  @Input({ required: true }) slots: TimeSlotView[] = [];
  @Input() isSubmitting = false;
  @Output() submitBooking = new EventEmitter<BookingSubmitPayload>();
  @Output() cancel = new EventEmitter<void>();

  title = '';
  requesterEmail = '';
  participantInput = '';
  participants: string[] = [];
  startTime = '';
  endTime = '';
  errors: Record<string, string> = {};

  endTimeOptions: EndOption[] = [];
  loadingPreview = false;
  previewError = '';
  availabilityPreview: AvailabilityPreviewDto | null = null;

  participantSearchResults: DirectoryUserDto[] = [];
  showParticipantDropdown = false;

  requesterSearchResults: DirectoryUserDto[] = [];
  showRequesterDropdown = false;
  showRequesterConflictConfirm = false;

  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly participantQuery$ = new Subject<string>();
  private readonly requesterQuery$ = new Subject<string>();

  constructor(
    private readonly api: RoomsApiService,
    private readonly schedule: RoomScheduleService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.participantQuery$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const normalized = query.trim();
          if (normalized.length < 2 || !this.localidade?.trim()) {
            this.participantSearchResults = [];
            this.showParticipantDropdown = false;
            this.cdr.markForCheck();
            return of<DirectoryUserDto[]>([]);
          }
          return this.api.searchDirectoryUsers(this.localidade, normalized).pipe(
            catchError(() => of({ users: [] })),
            switchMap((res) =>
              of(
                res.users.filter(
                  (u) =>
                    !this.participants.includes(u.email.toLowerCase()) &&
                    u.email.toLowerCase() !== this.requesterEmail.trim().toLowerCase(),
                ),
              ),
            ),
          );
        }),
      )
      .subscribe({
        next: (users) => {
          this.participantSearchResults = users;
          this.showParticipantDropdown = users.length > 0;
          this.cdr.markForCheck();
        },
      });

    this.requesterQuery$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const normalized = query.trim();
          if (normalized.length < 2 || !this.localidade?.trim()) {
            this.requesterSearchResults = [];
            this.showRequesterDropdown = false;
            this.cdr.markForCheck();
            return of<DirectoryUserDto[]>([]);
          }
          return this.api.searchDirectoryUsers(this.localidade, normalized).pipe(
            catchError(() => of({ users: [] })),
            switchMap((res) => of(res.users)),
          );
        }),
      )
      .subscribe({
        next: (users) => {
          this.requesterSearchResults = users;
          this.showRequesterDropdown = users.length > 0;
          this.cdr.markForCheck();
        },
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedSlot']) {
      this.syncTimesFromSelection();
    }
    if (changes['selectedSlot'] || changes['slots']) {
      this.computeEndOptions();
      this.schedulePreview();
    }
  }

  ngOnDestroy(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
  }

  onFieldChange(): void {
    this.schedulePreview();
  }

  addParticipant(value?: string): void {
    const raw = (value ?? this.participantInput).trim().toLowerCase();
    if (!raw) return;
    if (!this.isValidEmail(raw)) {
      this.errors['participants'] = `E-mail invalido: ${raw}`;
      return;
    }
    if (raw === this.requesterEmail.trim().toLowerCase()) {
      this.errors['participants'] = 'Nao repita o solicitante na lista de participantes';
      return;
    }
    if (this.participants.includes(raw)) {
      this.participantInput = '';
      return;
    }
    this.participants = [...this.participants, raw];
    this.participantInput = '';
    this.errors['participants'] = '';
    this.schedulePreview();
    this.cdr.detectChanges();
  }

  removeParticipant(email: string): void {
    this.participants = this.participants.filter((participant) => participant !== email);
    this.schedulePreview();
    this.cdr.detectChanges();
  }

  onParticipantKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addParticipant();
    }
  }

  onRequesterInputChange(event?: Event): void {
    const value = event && event.target && 'value' in event.target
      ? (event.target as HTMLInputElement).value
      : this.requesterEmail;
    this.requesterQuery$.next(value ?? '');
    this.onFieldChange();
  }

  selectRequesterFromSearch(user: DirectoryUserDto): void {
    this.requesterEmail = user.email;
    this.requesterSearchResults = [];
    this.showRequesterDropdown = false;
    this.onFieldChange();
    this.cdr.markForCheck();
  }

  onRequesterInputBlur(): void {
    setTimeout(() => {
      this.showRequesterDropdown = false;
      this.cdr.markForCheck();
    }, 150);
  }

  onParticipantInputChange(event?: Event): void {
    const value = event && event.target && 'value' in event.target
      ? (event.target as HTMLInputElement).value
      : this.participantInput;
    this.participantQuery$.next(value ?? '');
  }

  selectParticipantFromSearch(user: DirectoryUserDto): void {
    const email = user.email.toLowerCase();
    if (this.participants.includes(email) || email === this.requesterEmail.trim().toLowerCase()) return;
    this.participants = [...this.participants, email];
    this.participantInput = '';
    this.participantSearchResults = [];
    this.showParticipantDropdown = false;
    this.schedulePreview();
    this.cdr.detectChanges();
  }

  onParticipantInputBlur(): void {
    setTimeout(() => {
      this.showParticipantDropdown = false;
    }, 150);
  }

  submit(): void {
    if (this.isSubmitting) return;
    if (!this.validate()) return;
    if (this.hasBlockingConflicts) return;
    if (this.requesterHasConflict) {
      this.showRequesterConflictConfirm = true;
      this.cdr.markForCheck();
      return;
    }
    this.emitBooking();
  }

  confirmRequesterConflict(): void {
    this.showRequesterConflictConfirm = false;
    this.emitBooking(true);
  }

  cancelRequesterConflictConfirm(): void {
    this.showRequesterConflictConfirm = false;
    this.cdr.markForCheck();
  }

  private emitBooking(allowRequesterConflict = false): void {
    this.submitBooking.emit({
      title: this.title.trim(),
      startTime: this.startTime,
      endTime: this.endTime,
      requesterEmail: this.normalizedRequesterEmail,
      participants: this.participants.filter((item) => item !== this.normalizedRequesterEmail),
      ...(allowRequesterConflict ? { allowRequesterConflict: true } : {}),
    });
  }

  get errorSummary(): string {
    const first = Object.values(this.errors)[0];
    return first ?? '';
  }

  get normalizedRequesterEmail(): string {
    return this.requesterEmail.trim().toLowerCase();
  }

  get requesterPreview(): AvailabilityItemDto | undefined {
    if (!this.availabilityPreview?.participants?.length || !this.normalizedRequesterEmail) return undefined;
    return this.availabilityPreview.participants.find(
      (p) => p.email.trim().toLowerCase() === this.normalizedRequesterEmail,
    );
  }

  get requesterHasConflict(): boolean {
    const preview = this.requesterPreview;
    if (!preview) return false;
    return this.isPreviewEntityBusy(preview);
  }

  get otherParticipantsHaveConflicts(): boolean {
    if (!this.availabilityPreview?.participants?.length) return false;
    return this.optionalParticipantPreview.some((p) => this.isPreviewEntityBusy(p));
  }

  get hasBlockingConflicts(): boolean {
    if (!this.availabilityPreview) return false;
    return this.roomHasConflicts || this.otherParticipantsHaveConflicts;
  }

  get requesterConflictMessage(): string {
    const timeRange = `${this.formatIsoTime(this.startTime)} – ${this.formatIsoTime(this.endTime)}`;
    const subject = this.requesterPreview?.conflicts?.find((c) => c.subject?.trim())?.subject?.trim();
    const base = `O solicitante (${this.normalizedRequesterEmail}) já tem compromisso neste horário (${timeRange}).`;
    if (subject) {
      return `${base} Conflito: "${subject}". Deseja realmente agendar a reunião?`;
    }
    return `${base} Deseja realmente agendar a reunião?`;
  }

  get availableCount(): number {
    return this.optionalParticipantPreview.filter((p) => this.isEntityAvailable(p)).length;
  }

  get conflictCount(): number {
    return this.optionalParticipantPreview.filter((p) => !this.isEntityAvailable(p)).length;
  }

  get roomHasConflicts(): boolean {
    if (!this.availabilityPreview) return false;
    return this.hasRoomConflictsForSelectedRange();
  }

  get submitConflictLabel(): string {
    if (this.otherParticipantsHaveConflicts) {
      return 'Conflito na agenda';
    }
    if (this.roomHasConflicts) {
      return 'Sala indisponível';
    }
    return 'Resolva os Conflitos';
  }

  isRequesterEmail(email: string): boolean {
    return email.trim().toLowerCase() === this.normalizedRequesterEmail;
  }

  isParticipantAvailable(email: string): boolean {
    if (this.isRequesterEmail(email)) {
      return !this.requesterHasConflict;
    }
    const p = this.availabilityPreview?.participants?.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!p) return true;
    return this.isEntityAvailable(p);
  }

  isEntityAvailable(entity: AvailabilityItemDto): boolean {
    return !this.isPreviewEntityBusy(entity);
  }

  isRoomAvailable(): boolean {
    return !this.roomHasConflicts;
  }

  /** Mesma regra do backend ao reservar (scheduleOverlap.blocksBooking). */
  private isPreviewEntityBusy(entity: AvailabilityItemDto): boolean {
    if (!this.startTime || !this.endTime) return false;
    return blocksBooking(this.startTime, this.endTime, entity);
  }

  formatIsoTime(value: string): string {
    return this.schedule.formatIsoTime(value);
  }

  formatSlotEndTime(slot: TimeSlotView): string {
    return this.schedule.formatMinutes(slot.endMinute);
  }

  private syncTimesFromSelection(): void {
    if (!this.selectedSlot) return;
    this.startTime = this.selectedSlot.startTime;
    this.endTime = this.selectedSlot.endTime;
  }

  private computeEndOptions(): void {
    if (!this.selectedSlot) {
      this.endTimeOptions = [];
      return;
    }

    const sorted = [...this.slots].sort((a, b) => a.startMinute - b.startMinute);
    const startIndex = this.findAnchorSlotIndex(sorted);
    if (startIndex < 0) {
      this.endTimeOptions = [];
      return;
    }

    const options: EndOption[] = [];

    for (let index = startIndex; index < sorted.length; index += 1) {
      const current = sorted[index];
      if (!current || current.status === 'occupied') break;
      if (index > startIndex) {
        const previous = sorted[index - 1];
        if (!previous || previous.endTime !== current.startTime) break;
      }

      const rangeStart =
        index === startIndex ? this.selectedSlot.startTime : current.startTime;
      const rangeStartLabel = this.formatIsoTime(rangeStart);
      const rangeEndLabel = this.formatIsoTime(current.endTime);

      options.push({
        value: current.endTime,
        label: `${rangeStartLabel} – ${rangeEndLabel}`,
      });
    }

    this.endTimeOptions = options;
    if (!options.some((option) => option.value === this.endTime)) {
      this.endTime = options[0]?.value ?? '';
    }
  }

  /** Índice do bloco de 30 min que contém o horário selecionado (inclui slots parciais). */
  private findAnchorSlotIndex(sorted: TimeSlotView[]): number {
    if (!this.selectedSlot) return -1;

    const exact = sorted.findIndex((slot) => slot.startTime === this.selectedSlot!.startTime);
    if (exact >= 0) return exact;

    const selectedStartMs = new Date(this.selectedSlot.startTime).getTime();
    const containing = sorted.findIndex((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();
      if (Number.isNaN(slotStart) || Number.isNaN(slotEnd) || Number.isNaN(selectedStartMs)) {
        return false;
      }
      return slotStart <= selectedStartMs && slotEnd > selectedStartMs;
    });
    if (containing >= 0) return containing;

    const blockStartMinute = Math.floor(this.selectedSlot.startMinute / 30) * 30;
    return sorted.findIndex((slot) => slot.startMinute === blockStartMinute);
  }

  private validate(): boolean {
    const errors: Record<string, string> = {};
    if (!this.title.trim()) errors['title'] = 'Titulo e obrigatorio';
    if (!this.requesterEmail.trim()) {
      errors['requesterEmail'] = 'E-mail do solicitante e obrigatorio';
    } else if (!this.isValidEmail(this.requesterEmail.trim().toLowerCase())) {
      errors['requesterEmail'] = 'Informe um e-mail valido';
    }
    if (!this.startTime) errors['startTime'] = 'Inicio e obrigatorio';
    if (!this.endTime) errors['endTime'] = 'Fim e obrigatorio';
    if (this.startTime && this.endTime && new Date(this.startTime).getTime() >= new Date(this.endTime).getTime()) {
      errors['endTime'] = 'A hora de fim deve ser maior que a hora de inicio';
    }
    if (this.participants.includes(this.requesterEmail.trim().toLowerCase())) {
      errors['participants'] = 'Nao repita o solicitante na lista de participantes';
    }
    this.errors = errors;
    return Object.keys(errors).length === 0;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private get optionalParticipantPreview(): AvailabilityItemDto[] {
    if (!this.availabilityPreview?.participants?.length) return [];
    return this.availabilityPreview.participants.filter((p) => !this.isRequesterEmail(p.email));
  }

  private schedulePreview(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      void this.loadPreview();
    }, 300);
  }

  private async loadPreview(): Promise<void> {
    if (!this.startTime || !this.endTime || !this.roomEmail) {
      this.availabilityPreview = null;
      this.previewError = '';
      this.cdr.detectChanges();
      return;
    }
    if (new Date(this.startTime).getTime() >= new Date(this.endTime).getTime()) {
      this.availabilityPreview = null;
      this.previewError = '';
      this.cdr.detectChanges();
      return;
    }

    const requester = this.requesterEmail.trim().toLowerCase();
    const onlyParticipants = this.participants.filter((e) => this.isValidEmail(e));
    const participants = this.isValidEmail(requester)
      ? [requester, ...onlyParticipants.filter((e) => e !== requester)]
      : onlyParticipants;
    this.loadingPreview = true;
    this.previewError = '';
    try {
      const response = await firstValueFrom(
        this.api.previewAvailability(this.localidade, {
          roomEmail: this.roomEmail,
          participants,
          start: this.startTime,
          end: this.endTime,
        }).pipe(timeout({ first: 15000 })),
      );
      this.availabilityPreview = response.preview;
      this.previewError = '';
    } catch (error) {
      const typedError = error as { error?: { message?: string }; message?: string } | null;
      this.previewError = typedError?.error?.message ?? typedError?.message ?? 'Falha ao carregar previa';
    } finally {
      this.loadingPreview = false;
      this.cdr.detectChanges();
    }
  }

  private hasRoomConflictsForSelectedRange(): boolean {
    if (this.availabilityPreview?.room && this.isPreviewEntityBusy(this.availabilityPreview.room)) {
      return true;
    }

    if (!this.selectedSlot || !this.startTime || !this.endTime || !this.slots?.length) {
      return false;
    }

    const rangeStart = new Date(this.startTime).getTime();
    const rangeEnd = new Date(this.endTime).getTime();
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeStart >= rangeEnd) {
      return false;
    }

    const overlappingSlots = this.slots.filter((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();
      if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) return false;
      return slotStart < rangeEnd && slotEnd > rangeStart;
    });

    return overlappingSlots.some((slot) => slot.status === 'occupied');
  }
}
