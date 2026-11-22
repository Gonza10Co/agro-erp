import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { SERVICE_WORKER_HABILITADO } from './app/core/offline/offline-config';
import { desregistrarTodo } from './app/core/offline/service-worker';

// Kill switch del service worker (o en desarrollo): no queda ni el registro ni sus cachés.
// Con el interruptor encendido, el AppComponent lo registra solo en las tablets de planta.
if (!environment.production || !SERVICE_WORKER_HABILITADO) void desregistrarTodo();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
