/**
 * Service worker propio (`public/sw.js`) SOLO en las tablets de planta: usuario con
 * rol ESTACION o las pantallas /fabricacion/estacion y /tv. En cualquier otro
 * usuario o pantalla (oficina) se desregistra y se borran sus cachés: el radio de
 * daño de un worker queda en las tablets. Solo en producción (en `ng serve` estorba).
 *
 * Versión nueva: el index se pide a la red primero, así que un despliegue nuevo
 * llega solo al recargar. Para que la tablet (que no se recarga en todo el turno)
 * lo tome, cada tanto se mira el index publicado; si su `main-*.js` cambió, se
 * recarga sola en una pantalla de planta cuando lleva un rato quieta: nunca en
 * medio de un pistolazo. La cola de pistolazos vive en localStorage, así que
 * recargar no pierde nada.
 */

/** Cada cuánto se mira si hay versión nueva publicada. */
export const INTERVALO_VERSION_MS = 10 * 60 * 1000;
/** Cuánto tiempo sin tocar la tablet (ni pistolazos) antes de recargar. */
export const QUIETUD_PARA_RECARGAR_MS = 30 * 1000;
/** Pantallas de las tablets de planta. */
export const RUTAS_TABLET = ['/fabricacion/estacion', '/tv'];
export const PREFIJO_CACHE = 'agro-shell-';

export function esRutaTablet(url: string): boolean {
  const ruta = url.split(/[?#]/)[0];
  return RUTAS_TABLET.some((r) => ruta === r || ruta.startsWith(r + '/'));
}

/** ¿Este dispositivo, en esta pantalla, es una tablet de planta? null = no se sabe (login). */
export function esTablet(rol: string | null, url: string): boolean | null {
  if (rol === 'ESTACION' || esRutaTablet(url)) return true;
  // En el login todavía no hay rol: ni se registra ni se borra nada.
  if (url.split(/[?#]/)[0] === '/login') return null;
  return false;
}

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

/** Quita todo rastro del worker: registros y cachés `agro-shell-*`. */
export async function desregistrarTodo(
  nav: Navigator = navigator,
  cachesApi: CacheStorage | undefined = typeof caches === 'undefined' ? undefined : caches,
): Promise<void> {
  try {
    if ('serviceWorker' in nav) {
      const regs = await nav.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (cachesApi) {
      const keys = await cachesApi.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIJO_CACHE)).map((k) => cachesApi.delete(k)));
    }
  } catch (e) {
    console.warn('No se pudo limpiar el service worker', e);
  }
}

export interface OpcionesRecarga {
  recargar: () => void;
  ahora?: () => number;
  enLinea?: () => boolean;
  /** Solo se recarga en las pantallas de planta. */
  rutaPermitida?: () => boolean;
  quietudMs?: number;
}

/**
 * Recarga cuando es seguro: hay versión nueva, hay red, se está en una pantalla de
 * planta y nadie tocó la tablet (pistola, dedo, rueda, scroll) en `quietudMs`.
 */
export class RecargaSegura {
  private pendiente = false;
  private ultimaActividad: number;
  private readonly ahora: () => number;
  private readonly enLinea: () => boolean;
  private readonly rutaPermitida: () => boolean;
  private readonly quietudMs: number;

  constructor(private readonly o: OpcionesRecarga) {
    this.ahora = o.ahora ?? (() => Date.now());
    this.enLinea = o.enLinea ?? (() => navigator.onLine !== false);
    this.rutaPermitida = o.rutaPermitida ?? (() => esRutaTablet(location.pathname));
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
    if (!this.pendiente || !this.enLinea() || !this.rutaPermitida()) return false;
    if (this.ahora() - this.ultimaActividad < this.quietudMs) return false;
    this.pendiente = false;
    this.o.recargar();
    return true;
  }
}

/** Eventos que cuentan como "alguien está usando la tablet". */
export const EVENTOS_ACTIVIDAD = ['keydown', 'pointerdown', 'touchstart', 'wheel', 'scroll'];

/**
 * Decide, pantalla a pantalla, si este dispositivo lleva service worker. Se llama
 * en cada navegación con lo que se sabe (rol y URL).
 */
export class ControlServiceWorker {
  private registrado = false;
  private vigiando = false;

  constructor(private readonly win: Window = window) {}

  actualizar(tablet: boolean | null): void {
    if (!('serviceWorker' in this.win.navigator) || tablet === null) return;
    if (tablet) this.registrar();
    else this.quitar();
  }

  private quitar(): void {
    this.registrado = false;
    void desregistrarTodo(this.win.navigator);
  }

  private registrar(): void {
    if (this.registrado) return;
    this.registrado = true;
    this.vigilarVersion();
    const nav = this.win.navigator;
    const hacer = () => {
      nav.serviceWorker
        .register('/sw.js')
        .then(() => nav.serviceWorker.ready)
        .then((reg) => {
          // Lo que esta pestaña ya cargó antes de que el worker existiera también se guarda.
          const urls = [
            ...performance.getEntriesByType('resource').map((e) => e.name),
            ...Array.from(this.win.document.querySelectorAll<HTMLScriptElement>('script[src]')).map((s) => s.src),
            ...Array.from(this.win.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).map((l) => l.href),
          ];
          reg.active?.postMessage({ type: 'precache', urls: [...new Set(urls)] });
        })
        .catch((e) => console.warn('Service worker no registrado', e));
    };
    if (this.win.document.readyState === 'complete') hacer();
    else this.win.addEventListener('load', hacer, { once: true });
  }

  private vigilarVersion(): void {
    if (this.vigiando) return;
    this.vigiando = true;
    const win = this.win;
    const nav = win.navigator;
    const recarga = new RecargaSegura({ recargar: () => win.location.reload(), rutaPermitida: () => esRutaTablet(win.location.pathname) });
    for (const ev of EVENTOS_ACTIVIDAD) {
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
  }
}
