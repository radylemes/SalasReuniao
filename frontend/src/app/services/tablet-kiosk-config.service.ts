import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TabletKioskConfig {
  apiBaseUrl: string;
  localidade: string;
  roomEmail: string;
  demoLocation: string;
  demoTemperature: number;
  demoTemperatureTarget: number;
  checkInModeEnabled: boolean;
  /** Minutos após o início da reserva para cancelar sem check-in. */
  checkInGraceMinutes: number;
}

export type TabletKioskConfigOverrides = Partial<TabletKioskConfig>;

const STORAGE_KEY = 'tablet-kiosk-config';
const TEMP_MIN = 16;
const TEMP_MAX = 28;
const CHECKIN_GRACE_MIN = 1;
const CHECKIN_GRACE_MAX = 60;
const CHECKIN_GRACE_DEFAULT = 15;

@Injectable({ providedIn: 'root' })
export class TabletKioskConfigService {
  private readonly configSubject = new BehaviorSubject<TabletKioskConfig>(this.buildConfig());
  readonly config$ = this.configSubject.asObservable();

  getConfig(): TabletKioskConfig {
    return this.configSubject.value;
  }

  saveConfig(overrides: TabletKioskConfigOverrides): void {
    const merged = { ...this.getConfig(), ...overrides };
    this.validate(merged);
    const stored = this.readStored();
    const nextStored: TabletKioskConfigOverrides = { ...stored, ...overrides };
    this.writeStored(nextStored);
    this.configSubject.next(this.buildConfig());
  }

  resetToDefaults(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.configSubject.next(this.buildConfig());
  }

  private buildConfig(): TabletKioskConfig {
    const kiosk = environment.kiosk as {
      localidade?: string;
      roomEmail?: string;
      demoLocation?: string;
      demoTemperature?: number;
      demoTemperatureTarget?: number;
      checkInModeEnabled?: boolean;
      checkInGraceMinutes?: number;
    };
    const defaults: TabletKioskConfig = {
      apiBaseUrl: environment.apiBaseUrl,
      localidade: kiosk.localidade ?? '',
      roomEmail: kiosk.roomEmail ?? '',
      demoLocation: kiosk.demoLocation ?? '',
      demoTemperature: kiosk.demoTemperature ?? 22,
      demoTemperatureTarget: kiosk.demoTemperatureTarget ?? 22,
      checkInModeEnabled: kiosk.checkInModeEnabled ?? false,
      checkInGraceMinutes: kiosk.checkInGraceMinutes ?? CHECKIN_GRACE_DEFAULT,
    };
    const stored = this.readStored();
    const merged = { ...defaults, ...stored };
    merged.checkInGraceMinutes = this.normalizeGraceMinutes(merged.checkInGraceMinutes);
    return merged;
  }

  normalizeGraceMinutes(value?: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return CHECKIN_GRACE_DEFAULT;
    return Math.min(CHECKIN_GRACE_MAX, Math.max(CHECKIN_GRACE_MIN, Math.round(n)));
  }

  private readStored(): TabletKioskConfigOverrides {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as TabletKioskConfigOverrides;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeStored(overrides: TabletKioskConfigOverrides): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      /* ignore */
    }
  }

  private validate(config: TabletKioskConfig): void {
    if (!config.apiBaseUrl?.trim()) {
      throw new Error('URL da API é obrigatória.');
    }
    if (!config.roomEmail?.includes('@')) {
      throw new Error('E-mail da sala inválido.');
    }
    if (config.demoTemperature < TEMP_MIN || config.demoTemperature > TEMP_MAX) {
      throw new Error(`Temperatura atual deve estar entre ${TEMP_MIN} e ${TEMP_MAX}°C.`);
    }
    if (config.demoTemperatureTarget < TEMP_MIN || config.demoTemperatureTarget > TEMP_MAX) {
      throw new Error(`Temperatura meta deve estar entre ${TEMP_MIN} e ${TEMP_MAX}°C.`);
    }
    if (
      config.checkInGraceMinutes < CHECKIN_GRACE_MIN ||
      config.checkInGraceMinutes > CHECKIN_GRACE_MAX
    ) {
      throw new Error(`Tempo de espera deve estar entre ${CHECKIN_GRACE_MIN} e ${CHECKIN_GRACE_MAX} minutos.`);
    }
  }
}
