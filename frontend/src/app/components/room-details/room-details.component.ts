import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoomView } from '../../models/ui.models';

@Component({
  selector: 'app-room-details',
  standalone: true,
  templateUrl: './room-details.component.html',
  styleUrl: './room-details.component.scss',
})
export class RoomDetailsComponent {
  @Input({ required: true }) room!: RoomView;
  @Output() back = new EventEmitter<void>();

  get statusClass(): string {
    return this.room.status === 'occupied' ? 'badge-occupied' : 'badge-available';
  }
}
