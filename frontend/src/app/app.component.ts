import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToasterComponent } from './shared/ui/toaster/toaster.component';
import { PistolaGlobalService } from './core/pistola/pistola-global.service';

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
  }
}
