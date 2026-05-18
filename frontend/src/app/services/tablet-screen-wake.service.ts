import { Injectable } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

/** Modo kiosk no tablet: ecrã ligado + fullscreen sem barras do sistema. */
@Injectable({ providedIn: 'root' })
export class TabletScreenWakeService {
  private wakeLock: WakeLockSentinel | null = null;
  private releaseOnVisibility?: () => void;
  private fullscreenBound = false;

  async enable(): Promise<void> {
    await Promise.all([this.requestWakeLock(), this.enableFullscreen()]);
    this.bindVisibilityRecovery();
  }

  disable(): void {
    this.unbindVisibilityRecovery();
    void this.releaseWakeLock();
  }

  async enableFullscreen(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await this.hideSystemBars();
    this.bindFullscreenRecovery();
  }

  private async hideSystemBars(): Promise<void> {
    try {
      await StatusBar.hide();
    } catch {
      /* ignore */
    }
  }

  private bindFullscreenRecovery(): void {
    if (this.fullscreenBound) return;
    this.fullscreenBound = true;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void this.hideSystemBars();
      }
    });
  }

  private async requestWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      /* permissão negada ou API indisponível */
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* ignore */
    }
    this.wakeLock = null;
  }

  /** O Wake Lock é libertado quando a página fica oculta; reativa ao voltar. */
  private bindVisibilityRecovery(): void {
    if (this.releaseOnVisibility || !('wakeLock' in navigator)) return;
    this.releaseOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        void this.requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', this.releaseOnVisibility);
  }

  private unbindVisibilityRecovery(): void {
    if (!this.releaseOnVisibility) return;
    document.removeEventListener('visibilitychange', this.releaseOnVisibility);
    this.releaseOnVisibility = undefined;
  }
}
