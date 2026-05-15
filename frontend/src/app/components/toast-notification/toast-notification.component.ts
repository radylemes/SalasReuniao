import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastData {
  variant: ToastVariant;
  title: string;
  message: string;
}

@Component({
  selector: 'app-toast-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-notification.component.html',
  styleUrl: './toast-notification.component.scss',
})
export class ToastNotificationComponent {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA) readonly data: ToastData,
    private readonly snackRef: MatSnackBarRef<ToastNotificationComponent>,
  ) {}

  get iconClass(): string {
    switch (this.data.variant) {
      case 'success':
        return 'fa-circle-check';
      case 'error':
        return 'fa-circle-xmark';
      case 'warning':
        return 'fa-circle-exclamation';
      default:
        return 'fa-circle-info';
    }
  }

  close(): void {
    this.snackRef.dismiss();
  }
}
