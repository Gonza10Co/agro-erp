/**
 * Registro del service worker propio (`public/sw.js`) y aviso de versión nueva.
 * Solo en producción (main.ts): en `ng serve` un worker guardando el shell
 * estorba más de lo que ayuda.
 *
 * Versión nueva: el index se pide a la red primero, así que un despliegue nuevo
 * llega solo al recargar. Para que la tablet (que no se recarga en todo el turno)
 * lo tome, cada tanto se mira el index publicado; si su `main-*.js` cambió, se
 * recarga sola cuando lleva un rato quieta: nunca en medio de un pistolazo. La
 * cola de pistolazos vive en localStorage, así que recargar no pierde nada.
 */

/** Cada cuánto se mira si hay versión nueva publicada. */
export const INTERVALO_VERSION_MS = 10 * 60 * 1000;
/** Cuánto tiempo sin tocar la tablet (ni pistolazos) antes de recargar. */
export const QUIETUD_PARA_RECARGAR_MS = 30 * 1000;

/** El `main-XXXX.js` que referencia un index.html (null si no lo encuentra). */
export function scriptPrincipal(html: string): string | null {
  const m = /<script[^>]+src="([^"]*main-[A-Za-z0-9]+\.js)"/i.exec(html);
  return m ? m[1].replace(/^\/+/, '') : null;
}

/** El `main-XXXX.js` con el que arrancó esta pestaña. */
export function scriptPrincipalActual(doc: Document = document): string | null {
  const s = Array.from(doc.querySelectorAll('script[src]')).find((x) => /main-[A-Za-z0-9]+\.js/.test(x.getAttribute('src') ?? ''));
  return s ? (s.getAttribute('src') ?? '').replace(/^\/+/, '') : null;
}

export interface OpcionesRecarga {
  recargar: () => void;
  ahora?: () => number;
  enLinea?: () => boolean;
  quietudMs?: number;
}

/**
 * Recarga cuando es seguro: hay versión nueva, hay red y nadie tocó la tablet
 * (teclado de la pistola, dedo) en `quietudMs`.
 */
export class RecargaSegura {
  private pendiente = false;
  private ultimaActividad: number;
  private readonly ahora: () => number;
  private readonly enLinea: () => boolean;
  private readonly quietudMs: number;

  constructor(private readonly o: OpcionesRecarga) {
    this.ahora = o.ahora ?? (() => Date.now());
    this.enLinea = o.enLinea ?? (() => navigator.onLine !== false);
    this.quietudMs = o.quietudMs ?? QUIETUD_PARA_RECARGAR_MS;
    this.ultimaActividad = this.ahora();
  }

  get hayVersionNueva(): boolean {
    return this.pendiente;
  }

  versionNueva(): void {
    this.pendiente = true;
  }

  actividad(): void {
    this.ultimaActividad = this.ahora();
  }

  /** Se llama cada tanto: recarga si se cumplen las condiciones. Devuelve si recargó. */
  revisar(): boolean {
    if (!this.pendiente || !this.enLinea()) return false;
    if (this.ahora() - this.ultimaActividad < this.quietudMs) return false;
    this.pendiente = false;
    this.o.recargar();
    return true;
  }
}

export function registrarServiceWorker(win: Window = window): void {
  const nav = win.navigator;
  if (!('serviceWorker' in nav)) return;
  const recarga = new RecargaSegura({ recargar: () => win.location.reload() });
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) {
    win.addEventListener(ev, () => recarga.actividad(), { capture: true, passive: true });
  }
  setInterval(() => recarga.revisar(), 5000);

  const actual = scriptPrincipalActual(win.document);
  const mirarVersion = () => {
    if (!actual || nav.onLine === false) return;
    fetch('/index.html', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        const publicado = scriptPrincipal(html);
        if (publicado && publicado !== actual) recarga.versionNueva();
      })
      .catch(() => { /* sin red: se mira la próxima vez */ });
  };
  setInterval(mirarVersion, INTERVALO_VERSION_MS);
  win.addEventListener('online', mirarVersion);

  const teniaControlador = !!nav.serviceWorker.controller;
  nav.serviceWorker.addEventListener('controllerchange', () => {
    // El primer worker en tomar control no es una versión nueva de la app.
    if (teniaControlador) recarga.versionNueva();
  });

  const registrar = () => {
    nav.serviceWorker
      .register('/sw.js')
      .then(() => nav.serviceWorker.ready)
      .then((reg) => {
        // Lo que esta pestaña ya cargó antes de que el worker existiera también se guarda.
        const urls = [
          ...performance.getEntriesByType('resource').map((e) => e.name),
          ...Array.from(win.document.querySelectorAll<HTMLScriptElement>('script[src]')).map((s) => s.src),
          ...Array.from(win.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).map((l) => l.href),
        ];
        reg.active?.postMessage({ type: 'precache', urls: [...new Set(urls)] });
      })
      .catch((e) => console.warn('Service worker no registrado', e));
  };
  if (win.document.readyState === 'complete') registrar();
  else win.addEventListener('load', registrar, { once: true });
}
