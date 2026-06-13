import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/notificaciones/toast.service';

@Component({
  selector: 'app-toaster',
  standalone: true,
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="toast"
          [class.success]="t.tipo === 'exito'"
          [class.error]="t.tipo === 'error'"
          [class.info]="t.tipo === 'info'"
          role="status"
        >
          <span class="t-ic" aria-hidden="true">
            @switch (t.tipo) {
              @case ('exito') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              }
              @case ('error') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
              }
              @default {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
              }
            }
          </span>
          <span class="t-msg">{{ t.mensaje }}</span>
          <button class="t-close" type="button" aria-label="Cerrar" (click)="toast.cerrar(t.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToasterComponent {
  readonly toast = inject(ToastService);
}
