import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToasterComponent } from './shared/ui/toaster/toaster.component';
import { PistolaGlobalService } from './core/pistola/pistola-global.service';
import { OfflineScanQueueService } from './core/offline/offline-scan-queue.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToasterComponent],
  template: `
    <router-outlet />
    <app-toaster />
  `,
})
export class AppComponent {
  constructor() {
    // La pistola registra pares desde cualquier pantalla (aviso verde/amarillo/rojo).
    inject(PistolaGlobalService).iniciar();
    // Los pistolazos guardados sin señal se envían solos, desde cualquier pantalla.
    inject(OfflineScanQueueService).iniciar();
  }
}
