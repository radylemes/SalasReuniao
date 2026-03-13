import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TimeSlotView } from '../../models/ui.models';

export interface PeriodGroup {
  label: string;
  slots: TimeSlotView[];
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class TimelineComponent {
  @Input({ required: true }) slots: TimeSlotView[] = [];
  @Input() selectedSlot: TimeSlotView | null = null;
  @Input() filterOnlyAvailable = false;
  @Output() slotSelect = new EventEmitter<TimeSlotView>();

  /** Agrupa slots por período: Madrugada 00:00-06:00, Manhã 06:00-12:00, Tarde 12:00-18:00, Noite 18:00-24:00 */
  get slotsByPeriod(): PeriodGroup[] {
    const madrugada: TimeSlotView[] = [];
    const manha: TimeSlotView[] = [];
    const tarde: TimeSlotView[] = [];
    const noite: TimeSlotView[] = [];
    for (const slot of this.slots) {
      if (this.filterOnlyAvailable && slot.status === 'occupied') continue;
      if (slot.startMinute < 360) madrugada.push(slot);
      else if (slot.startMinute < 720) manha.push(slot);
      else if (slot.startMinute < 1080) tarde.push(slot);
      else noite.push(slot);
    }
    const result: PeriodGroup[] = [];
    if (madrugada.length) result.push({ label: 'Madrugada (00:00 - 06:00)', slots: madrugada });
    if (manha.length) result.push({ label: 'Manhã (06:00 - 12:00)', slots: manha });
    if (tarde.length) result.push({ label: 'Tarde (12:00 - 18:00)', slots: tarde });
    if (noite.length) result.push({ label: 'Noite (18:00 - 23:59)', slots: noite });
    return result;
  }

  getSlotClass(slot: TimeSlotView): string {
    let result = 'time-slot ' + (slot.status === 'occupied' ? 'unavailable' : 'available');
    if (this.selectedSlot && this.selectedSlot.startMinute === slot.startMinute) {
      result += ' selected';
    }
    return result;
  }

  onSlotClick(slot: TimeSlotView): void {
    if (slot.status === 'occupied') return;
    this.slotSelect.emit(slot);
  }
}
