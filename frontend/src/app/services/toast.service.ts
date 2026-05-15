import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastData, ToastNotificationComponent, ToastVariant } from '../components/toast-notification/toast-notification.component';

const DEFAULT_TITLES: Record<ToastVariant, string> = {
  success: 'Sucesso',
  error: 'Erro',
  info: 'Informação',
  warning: 'Atenção',
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private readonly snackBar: MatSnackBar) {}

  show(variant: ToastVariant, message: string, title?: string): void {
    const duration = variant === 'error' ? 9000 : 6500;
    this.snackBar.openFromComponent(ToastNotificationComponent, {
      data: {
        variant,
        title: title ?? DEFAULT_TITLES[variant],
        message,
      } satisfies ToastData,
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['app-toast-panel', `app-toast-panel--${variant}`],
    });
  }

  success(message: string, title?: string): void {
    this.show('success', message, title);
  }

  error(message: string, title?: string): void {
    this.show('error', message, title);
  }

  info(message: string, title?: string): void {
    this.show('info', message, title);
  }

  warning(message: string, title?: string): void {
    this.show('warning', message, title);
  }
}
