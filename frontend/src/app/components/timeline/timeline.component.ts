import { Component, EventEmitter, HostListener, Inject, Input, OnInit, Output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TimeSlotView } from '../../models/ui.models';

export interface DisplaySlot extends TimeSlotView {
  span: number;
  displayTime: string;
}

export interface PeriodGroup {
  label: string;
  slots: DisplaySlot[];
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class TimelineComponent implements OnInit {
  @Input({ required: true }) slots: TimeSlotView[] = [];
  @Input() selectedSlot: TimeSlotView | null = null;
  @Input() filterOnlyAvailable = false;
  @Output() slotSelect = new EventEmitter<TimeSlotView>();

  columns = 6;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.updateColumns(window.innerWidth);
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (isPlatformBrowser(this.platformId)) {
      this.updateColumns(event.target.innerWidth);
    }
  }

  private updateColumns(width: number) {
    if (width <= 480) {
      this.columns = 2;
    } else if (width <= 768) {
      this.columns = 3;
    } else {
      this.columns = 6;
    }
  }

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
    if (madrugada.length) result.push({ label: 'Madrugada (00:00 - 06:00)', slots: this.groupSlots(madrugada) });
    if (manha.length) result.push({ label: 'Manhã (06:00 - 12:00)', slots: this.groupSlots(manha) });
    if (tarde.length) result.push({ label: 'Tarde (12:00 - 18:00)', slots: this.groupSlots(tarde) });
    if (noite.length) result.push({ label: 'Noite (18:00 - 23:59)', slots: this.groupSlots(noite) });
    return result;
  }

  private groupSlots(slots: TimeSlotView[]): DisplaySlot[] {
    if (!slots.length) return [];
    
    const displaySlots: DisplaySlot[] = [];
    let currentGroup: DisplaySlot | null = null;
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const colIndex = i % this.columns;

      if (!currentGroup) {
        currentGroup = { ...slot, span: 1, displayTime: slot.time };
        continue;
      }

      const isContiguous = currentGroup.endMinute === slot.startMinute;
      const isBothOccupied = currentGroup.status === 'occupied' && slot.status === 'occupied';
      const isSameBooker = currentGroup.bookedBy === slot.bookedBy && !!currentGroup.bookedBy;
      const isSameRow = colIndex !== 0;

      if (isContiguous && isBothOccupied && isSameBooker && isSameRow) {
        currentGroup.endMinute = slot.endMinute;
        currentGroup.endTime = slot.endTime;
        currentGroup.span += 1;
      } else {
        this.finalizeGroupDisplayTime(currentGroup);
        displaySlots.push(currentGroup);
        currentGroup = { ...slot, span: 1, displayTime: slot.time };
      }
    }

    if (currentGroup) {
      this.finalizeGroupDisplayTime(currentGroup);
      displaySlots.push(currentGroup);
    }

    return displaySlots;
  }

  private finalizeGroupDisplayTime(group: DisplaySlot): void {
    if (group.span > 1) {
       group.displayTime = `${group.time} - ${this.formatMinutes(group.endMinute)}`;
    }
  }

  private formatMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
