import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { BookingView } from '../../models/ui.models';

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './bookings-list.component.html',
  styleUrl: './bookings-list.component.scss',
})
export class BookingsListComponent {
  @Input({ required: true }) bookings: BookingView[] = [];
  @Input() hideHeader = false;
}
