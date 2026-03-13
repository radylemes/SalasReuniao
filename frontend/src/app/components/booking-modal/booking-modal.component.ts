import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, of, startWith, switchMap } from 'rxjs';
import {
  AvailabilityPreviewDto,
  DirectoryUserDto,
  RoomDto,
  RoomsApiService,
} from '../../services/rooms-api.service';

export interface BookingModalData {
  localidade: string;
  rooms: RoomDto[];
}

export interface BookingModalResult {
  roomEmail: string;
  title: string;
  start: string;
  end: string;
  requesterEmail: string;
  participants: string[];
}

@Component({
  selector: 'app-booking-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './booking-modal.component.html',
  styleUrl: './booking-modal.component.scss',
})
export class BookingModalComponent implements OnInit {
  readonly form;
  readonly participantQueryControl;

  selectedParticipants: DirectoryUserDto[] = [];
  participantOptions: DirectoryUserDto[] = [];
  preview: AvailabilityPreviewDto | null = null;
  previewLoading = false;
  previewError: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly api: RoomsApiService,
    private readonly snackBar: MatSnackBar,
    private readonly dialogRef: MatDialogRef<BookingModalComponent, BookingModalResult>,
    @Inject(MAT_DIALOG_DATA) readonly data: BookingModalData,
  ) {
    this.form = this.fb.nonNullable.group({
      roomEmail: [data.rooms[0]?.email ?? '', Validators.required],
      title: ['', [Validators.required, Validators.minLength(3)]],
      requesterEmail: ['', [Validators.required, Validators.email]],
      start: [new Date().toISOString(), Validators.required],
      end: [new Date(Date.now() + 60 * 60 * 1000).toISOString(), Validators.required],
    });
    this.participantQueryControl = this.fb.nonNullable.control('');
  }

  ngOnInit(): void {
    this.participantQueryControl.valueChanges
      .pipe(
        startWith(''),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const normalized = query.trim();
          if (normalized.length < 2) return of<DirectoryUserDto[]>([]);
          return this.api.searchDirectoryUsers(this.data.localidade, normalized).pipe(
            map((response) => response.users.filter((user) => !this.participantExists(user.email))),
            catchError(() => of<DirectoryUserDto[]>([])),
          );
        }),
      )
      .subscribe({
        next: (users) => {
          this.participantOptions = users;
        },
      });

    this.form.valueChanges.pipe(debounceTime(400)).subscribe(() => {
      this.fetchPreview(true);
    });
  }

  get canPreview(): boolean {
    if (!this.form.controls.roomEmail.value) return false;
    if (!this.form.controls.start.value || !this.form.controls.end.value) return false;
    return new Date(this.form.controls.start.value).getTime() < new Date(this.form.controls.end.value).getTime();
  }

  onParticipantSelected(event: MatAutocompleteSelectedEvent): void {
    const user = event.option.value as DirectoryUserDto;
    if (this.participantExists(user.email)) return;

    this.selectedParticipants = [...this.selectedParticipants, user];
    this.participantQueryControl.setValue('');
    this.fetchPreview(true);
  }

  removeParticipant(email: string): void {
    this.selectedParticipants = this.selectedParticipants.filter((participant) => participant.email !== email);
    this.fetchPreview(true);
  }

  fetchPreview(showFeedbackOnError = false): void {
    if (!this.canPreview) {
      this.preview = null;
      this.previewError = null;
      return;
    }

    const { roomEmail, start, end } = this.form.getRawValue();
    this.previewLoading = true;
    this.previewError = null;

    this.api
      .previewAvailability(this.data.localidade, {
        roomEmail,
        start,
        end,
        participants: this.selectedParticipants.map((participant) => participant.email),
      })
      .pipe(finalize(() => (this.previewLoading = false)))
      .subscribe({
        next: (response) => {
          this.preview = response.preview;
        },
        error: (error) => {
          this.preview = null;
          const message =
            error?.error?.message ||
            (typeof error?.message === 'string' ? error.message : 'Falha ao consultar disponibilidade.');
          this.previewError = message;
          if (showFeedbackOnError) {
            this.snackBar.open(message, 'Fechar', { duration: 5000 });
          }
        },
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();
    const startMs = new Date(payload.start).getTime();
    const endMs = new Date(payload.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
      this.snackBar.open('Intervalo invalido: inicio deve ser menor que fim.', 'Fechar', { duration: 5000 });
      return;
    }

    this.dialogRef.close({
      ...payload,
      requesterEmail: payload.requesterEmail.trim().toLowerCase(),
      participants: this.selectedParticipants.map((participant) => participant.email),
    });
  }

  private participantExists(email: string): boolean {
    return this.selectedParticipants.some((participant) => participant.email === email);
  }
}
