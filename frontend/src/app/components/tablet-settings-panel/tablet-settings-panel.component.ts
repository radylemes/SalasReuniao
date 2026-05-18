import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomsApiService } from '../../services/rooms-api.service';
import { TabletKioskConfig, TabletKioskConfigService } from '../../services/tablet-kiosk-config.service';

@Component({
  selector: 'app-tablet-settings-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tablet-settings-panel.component.html',
  styleUrl: './tablet-settings-panel.component.scss',
})
export class TabletSettingsPanelComponent implements OnChanges {
  @Input({ required: true }) config!: TabletKioskConfig;
  @Output() saved = new EventEmitter<TabletKioskConfig>();
  @Output() closed = new EventEmitter<void>();

  errorMessage = '';

  private readonly fb = inject(FormBuilder);
  private readonly kioskConfig = inject(TabletKioskConfigService);
  private readonly api = inject(RoomsApiService);

  readonly form: FormGroup = this.fb.nonNullable.group({
    apiBaseUrl: ['', Validators.required],
    localidade: ['', Validators.required],
    roomEmail: ['', [Validators.required, Validators.email]],
    demoLocation: ['', Validators.required],
    demoTemperature: [22, [Validators.required, Validators.min(16), Validators.max(28)]],
    demoTemperatureTarget: [22, [Validators.required, Validators.min(16), Validators.max(28)]],
    checkInModeEnabled: [false],
    checkInGraceMinutes: [15, [Validators.required, Validators.min(1), Validators.max(60)]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.config) {
      this.form.patchValue(this.config);
      this.errorMessage = '';
    }
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    try {
      this.kioskConfig.saveConfig(value);
      await this.syncKioskSettingsToServer(value.localidade, value.roomEmail, {
        checkInModeEnabled: value.checkInModeEnabled,
        checkInGraceMinutes: this.kioskConfig.normalizeGraceMinutes(value.checkInGraceMinutes),
      });
      this.saved.emit(this.kioskConfig.getConfig());
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Erro ao guardar configuração.';
    }
  }

  private async syncKioskSettingsToServer(
    localidade: string,
    roomEmail: string,
    settings: { checkInModeEnabled: boolean; checkInGraceMinutes: number },
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.api.putKioskSettings(localidade, roomEmail, settings).subscribe({
        next: () => resolve(),
        error: (err) => reject(err),
      });
    });
  }

  onReset(): void {
    this.kioskConfig.resetToDefaults();
    const defaults = this.kioskConfig.getConfig();
    this.form.patchValue(defaults);
    this.errorMessage = '';
    this.saved.emit(defaults);
  }

  onClose(): void {
    this.closed.emit();
  }
}
