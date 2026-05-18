import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';

const DEFAULT_SETTINGS_PIN = '124578';

@Component({
  selector: 'app-tablet-pin-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tablet-pin-dialog.component.html',
  styleUrl: './tablet-pin-dialog.component.scss',
})
export class TabletPinDialogComponent {
  @Output() confirmed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  pin = '';
  pinError = '';

  private readonly expectedPin =
    (environment.kiosk as { settingsPin?: string }).settingsPin?.trim() || DEFAULT_SETTINGS_PIN;

  onSubmit(): void {
    const entered = this.pin.trim();
    if (entered !== this.expectedPin) {
      this.pinError = 'PIN incorreto.';
      this.pin = '';
      return;
    }
    this.pinError = '';
    this.confirmed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
