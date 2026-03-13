import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type HeaderTab = 'allianzparque' | 'wtorre' | 'novoanhangabau' | 'reservas';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  @Input() activeTab: HeaderTab = 'allianzparque';
  @Output() tabChange = new EventEmitter<HeaderTab>();
  @Output() refresh = new EventEmitter<void>();

  onTabClick(tab: HeaderTab): void {
    this.tabChange.emit(tab);
  }
}
