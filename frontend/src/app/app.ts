import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { distinctUntilChanged, finalize } from 'rxjs';
import { RoomDto, RoomScheduleDto, RoomsApiService } from './services/rooms-api.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, AfterViewInit {
  readonly localidades = ['WTorre', 'Allianz'];
  readonly filterForm;
  readonly bookingForm;

  rooms: RoomDto[] = [];
  scheduleMap = new Map<string, RoomScheduleDto>();
  loadingRooms = false;
  booking = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly api: RoomsApiService,
    private readonly snackBar: MatSnackBar,
  ) {
    this.filterForm = this.fb.nonNullable.group({
      localidade: this.getSavedLocalidade(),
    });
    this.bookingForm = this.fb.nonNullable.group({
      roomEmail: ['', Validators.required],
      title: ['', [Validators.required, Validators.minLength(3)]],
      start: ['', Validators.required],
      end: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.filterForm.controls.localidade.valueChanges.pipe(distinctUntilChanged()).subscribe((localidade) => {
      localStorage.setItem('localidade', localidade);
      this.loadRoomsAndAvailability();
    });
  }

  ngAfterViewInit(): void {
    // Evita ExpressionChanged no primeiro ciclo de renderizacao.
    queueMicrotask(() => this.loadRoomsAndAvailability());
  }

  refreshAvailability(): void {
    if (this.rooms.length === 0) return;
    const start = this.resolveStartDate();
    const end = this.resolveEndDate(start);
    this.api
      .checkSchedule(this.localidade, this.rooms.map((room) => room.email), start, end)
      .subscribe({
        next: (response) => {
          this.scheduleMap = new Map(response.schedule.map((item) => [item.roomEmail, item]));
        },
        error: (error) => this.handleApiError(error),
      });
  }

  submitBooking(): void {
    if (this.bookingForm.invalid) {
      this.bookingForm.markAllAsTouched();
      return;
    }

    const { roomEmail, title } = this.bookingForm.getRawValue();
    const start = this.resolveStartDate();
    const end = this.resolveEndDate(start);

    if (start >= end) {
      this.snackBar.open('Intervalo invalido: inicio deve ser menor que fim.', 'Fechar', { duration: 5000 });
      return;
    }

    this.booking = true;
    this.api
      .checkSchedule(this.localidade, [roomEmail], start, end)
      .pipe(finalize(() => (this.booking = false)))
      .subscribe({
        next: (schedule) => {
          const isAvailable = schedule.schedule[0]?.isAvailable ?? false;
          if (!isAvailable) {
            this.snackBar.open('Conflito detectado: sala indisponivel no periodo.', 'Fechar', { duration: 5000 });
            this.refreshAvailability();
            return;
          }

          this.api.bookRoom(this.localidade, roomEmail, title, start, end).subscribe({
            next: () => {
              this.snackBar.open('Reserva criada com sucesso.', 'Fechar', { duration: 4000 });
              this.refreshAvailability();
            },
            error: (error) => this.handleApiError(error),
          });
        },
        error: (error) => this.handleApiError(error),
      });
  }

  roomIsAvailable(roomEmail: string): boolean {
    return this.scheduleMap.get(roomEmail)?.isAvailable ?? true;
  }

  private loadRoomsAndAvailability(): void {
    this.loadingRooms = true;
    this.api
      .getRooms(this.localidade)
      .pipe(finalize(() => (this.loadingRooms = false)))
      .subscribe({
        next: (response) => {
          this.rooms = response.rooms;
          if (!this.bookingForm.controls.roomEmail.value && this.rooms[0]) {
            queueMicrotask(() =>
              this.bookingForm.controls.roomEmail.setValue(this.rooms[0]!.email, {
                emitEvent: false,
              }),
            );
          }
          this.refreshAvailability();
        },
        error: (error) => this.handleApiError(error),
      });
  }

  private get localidade(): string {
    return this.filterForm.controls.localidade.value;
  }

  private getSavedLocalidade(): string {
    const localidade = localStorage.getItem('localidade');
    return localidade && this.localidades.includes(localidade) ? localidade : 'WTorre';
  }

  private resolveStartDate(): string {
    return this.bookingForm.controls.start.value || new Date().toISOString();
  }

  private resolveEndDate(start: string): string {
    if (this.bookingForm.controls.end.value) return this.bookingForm.controls.end.value;
    const startDate = new Date(start);
    return new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
  }

  private handleApiError(error: any): void {
    const message =
      error?.error?.message ||
      (typeof error?.message === 'string' ? error.message : 'Erro inesperado de integracao.');
    this.snackBar.open(message, 'Fechar', { duration: 6000 });
  }
}
