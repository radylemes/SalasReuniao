import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { BookingModalComponent, BookingModalData } from './booking-modal.component';
import { RoomsApiService } from '../../services/rooms-api.service';

describe('BookingModalComponent', () => {
  const closeCalls: unknown[] = [];
  const mockDialogRef: Pick<MatDialogRef<BookingModalComponent>, 'close'> = {
    close: (result?: any) => {
      closeCalls.push(result);
    },
  };
  const mockData: BookingModalData = {
    localidade: 'WTorre',
    rooms: [{ name: 'Sala Azul', email: 'sala.azul@empresa.com', capacity: 10 }],
  };
  const mockApi: Pick<RoomsApiService, 'searchDirectoryUsers' | 'previewAvailability'> = {
    searchDirectoryUsers: () => of({ users: [] }),
    previewAvailability: () =>
      of({
        preview: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          room: { email: 'sala.azul@empresa.com', isAvailable: true, conflicts: [] },
          participants: [],
        },
      }),
  };
  const mockSnack: Pick<MatSnackBar, 'open'> = {
    open: () => ({} as any),
  };

  beforeEach(async () => {
    closeCalls.length = 0;
    await TestBed.configureTestingModule({
      imports: [BookingModalComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: RoomsApiService, useValue: mockApi },
        { provide: MatSnackBar, useValue: mockSnack },
      ],
    }).compileComponents();
  });

  it('should submit booking payload with requester and participants', () => {
    const fixture = TestBed.createComponent(BookingModalComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.selectedParticipants = [{ name: 'Ana', email: 'ana@empresa.com' }];
    component.form.patchValue({
      roomEmail: 'sala.azul@empresa.com',
      title: 'Reuniao de projeto',
      requesterEmail: 'SOLICITANTE@empresa.com',
      start: '2026-03-12T14:00:00Z',
      end: '2026-03-12T15:00:00Z',
    });
    component.submit();

    expect(closeCalls[0]).toEqual({
      roomEmail: 'sala.azul@empresa.com',
      title: 'Reuniao de projeto',
      requesterEmail: 'solicitante@empresa.com',
      start: '2026-03-12T14:00:00Z',
      end: '2026-03-12T15:00:00Z',
      participants: ['ana@empresa.com'],
    });
  });
});
