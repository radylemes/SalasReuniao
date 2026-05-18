import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TabletKioskConfigService } from './services/tablet-kiosk-config.service';
import { TabletScreenWakeService } from './services/tablet-screen-wake.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly kioskConfig = inject(TabletKioskConfigService);
  private readonly kioskDisplay = inject(TabletScreenWakeService);

  ngOnInit(): void {
    void this.kioskDisplay.enable();

    const { localidade, roomEmail } = this.kioskConfig.getConfig();
    if (roomEmail && localidade) {
      const target = ['/tablet', localidade, encodeURIComponent(roomEmail)];
      void this.router.navigate(target, { replaceUrl: true });
    }
  }
}
