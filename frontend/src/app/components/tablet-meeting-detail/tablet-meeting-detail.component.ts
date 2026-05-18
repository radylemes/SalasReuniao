import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoomScheduleService, UpcomingMeetingView } from '../../services/room-schedule.service';

@Component({
  selector: 'app-tablet-meeting-detail',
  standalone: true,
  templateUrl: './tablet-meeting-detail.component.html',
  styleUrl: './tablet-meeting-detail.component.scss',
})
export class TabletMeetingDetailComponent {
  @Input({ required: true }) meeting!: UpcomingMeetingView;
  @Input({ required: true }) roomName = '';
  @Output() closed = new EventEmitter<void>();

  constructor(private readonly schedule: RoomScheduleService) {}

  get startLabel(): string {
    return this.schedule.formatIsoDateTime(this.meeting.startTime);
  }

  get endLabel(): string {
    return this.schedule.formatIsoDateTime(this.meeting.endTime);
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  onCloseClick(): void {
    this.closed.emit();
  }
}
