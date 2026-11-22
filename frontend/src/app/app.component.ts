import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ToasterComponent } from './shared/ui/toaster/toaster.component';
import { PistolaGlobalService } from './core/pistola/pistola-global.service';
import { OfflineScanQueueService } from './core/offline/offline-scan-queue.service';
import { AuthService } from './core/auth/auth.service';
import { ControlServiceWorker, esTablet } from './core/offline/service-worker';
import { SERVICE_WORKER_HABILITADO } from './core/offline/offline-config';
import { environment } from '../environments/environment';

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
    // Service worker solo en las tablets de planta (rol ESTACION, estación o TV); en oficina se quita.
    if (environment.production && SERVICE_WORKER_HABILITADO) {
      const auth = inject(AuthService);
      const sw = new ControlServiceWorker();
      inject(Router).events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe((e) => sw.actualizar(esTablet(auth.rol(), e.urlAfterRedirects)));
    }
  }
}
