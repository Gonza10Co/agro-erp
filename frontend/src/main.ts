import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { registrarServiceWorker } from './app/core/offline/service-worker';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

// Que la tablet de planta abra la app aunque recarguen sin señal (public/sw.js).
if (environment.production) registrarServiceWorker();
