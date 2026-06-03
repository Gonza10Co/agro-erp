import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-drawer',
  standalone: true,
  template: `
    @if (open()) {
      <div class="scrim" (click)="closed.emit()"></div>
      <aside class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <h3 class="t-h3">{{ title() }}</h3>
          <button class="icon-btn" type="button" title="Cerrar" (click)="closed.emit()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="drawer-body"><ng-content /></div>
      </aside>
    }
  `,
})
export class DrawerComponent {
  open = input(false);
  title = input('');
  closed = output<void>();
}
