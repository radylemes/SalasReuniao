import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [],
  templateUrl: './room-card.component.html',
  styleUrl: './room-card.component.scss',
})
export class RoomCardComponent {
  @Input({ required: true }) id = '';
  @Input({ required: true }) name = '';
  @Input({ required: true }) email = '';
  @Input({ required: true }) capacity = 0;
  @Input({ required: true }) status: 'available' | 'occupied' = 'available';
  @Input({ required: true }) occupancyPercent = 0;
  @Output() select = new EventEmitter<string>();

  get statusClass(): string {
    return this.status === 'occupied' ? 'badge-occupied' : 'badge-available';
  }
}
