import { Injectable, OnDestroy, WritableSignal, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, TimeoutError, catchError, firstValueFrom, map, of, throwError, timeout } from 'rxjs';
import { FabricacionApi } from '../api/fabricacion.api';
import { AvanceResultado, DanoEscaneo } from '../api/models/fabricacion.models';
import { aHoraServidor, desfaseReloj } from './reloj-servidor';

/**
 * Cuánto espera un pistolazo la respuesta del servidor antes de guardarse en la
 * cola (internet lento, 2026-11-21). La operaria no puede quedarse esperando.
 */
export const ESPERA_SERVIDOR_MS = 2000;
/** Cada cuánto se reintenta la cola mientras tenga pistolazos. */
export const INTERVALO_SYNC_MS = 30_000;
/** La sincronización va en segundo plano: ahí sí se espera más. */
export const ESPERA_SYNC_MS = 20_000;

/** Un error del servidor que no es de red (500, 401...) se reintenta hasta aquí; luego va a rechazados. */
export const MAX_INTENTOS = 5;
export const CANDADO_SYNC = 'agro-offline-sync';

export const CLAVE_PENDIENTES = 'agro.offlineScans.v1';
export const CLAVE_CANDADO = 'agro.offlineScans.lock';
export const CLAVE_RECHAZADOS = 'agro.offlineScans.rejected.v1';

/** Lo que se necesita para registrar un pistolazo. */
export interface NuevoPistolazo {
  codigo: string;
  operarioId: number;
  maquinaId?: number;
  estacion: string;
  /** Con firma (`autorizacion`) nunca se guarda en la cola: la clave no queda en la tablet. */
  dano?: DanoEscaneo;
}

/** Un pistolazo guardado en la tablet, esperando a que vuelva la señal. */
export interface PistolazoPendiente extends NuevoPistolazo {
  /** Id de cliente: viaja como clientScanId para que un reintento no duplique. */
  id: string;
  /** Hora real del escaneo con el reloj de la TABLET (ISO). Al enviarse se corrige con el desfase. */
  scannedAt: string;
  /** Desfase del reloj (servidor − tablet) conocido al escanear; si no se sabía, se usa el de envío. */
  desfaseMs?: number;
  intentos: number;
}

/** El servidor no lo aceptó al sincronizar: alguien tiene que mirarlo. */
export interface PistolazoRechazado extends PistolazoPendiente {
  motivo: string;
  rechazadoAt: string;
}

export type ResultadoPistolazo =
  /** El servidor respondió a tiempo: feedback normal, validado. */
  | { tipo: 'servidor'; resultado: AvanceResultado }
  /** Aceptado en la tablet: se envía después. `porque` dice qué ver en pantalla. */
  | { tipo: 'encolado'; porque: 'sin-red' | 'lento' | 'cola'; pendientes: number; item: PistolazoPendiente }
  /** Ese par ya está en la cola de esta estación: no se guarda dos veces. */
  | { tipo: 'repetido-en-cola'; item: PistolazoPendiente };

/** id único del pistolazo; `crypto.randomUUID` no existe fuera de HTTPS en algunos navegadores. */
export function nuevoIdPistolazo(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
      const b = c.getRandomValues(new Uint8Array(16));
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* sigue al plan C */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** ¿La petición no llegó (o no volvió) por la red, y no por una regla del negocio? */
export function esFalloDeRed(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  const status = (e as { status?: number })?.status;
  // 0 = sin conexión; 502/503/504 = el proxy no llegó al servidor (Railway caído o reiniciando).
  return status === 0 || status === 502 || status === 503 || status === 504;
}

/** Fallos de la sincronización que no son culpa del pistolazo: se reintenta después. */
function esTransitorio(e: unknown): boolean {
  const status = (e as { status?: number })?.status ?? 0;
  return esFalloDeRed(e) || status === 401 || status === 408 || status === 429 || status >= 500;
}

function motivoDe(e: unknown): string {
  const cuerpo = (e as HttpErrorResponse)?.error as { message?: string | string[] } | null;
  const m = cuerpo?.message;
  return (Array.isArray(m) ? m.join(', ') : m) || `El servidor lo rechazó (${(e as { status?: number })?.status ?? '?'})`;
}

function leer<T>(clave: string): T[] {
  try {
    const raw = localStorage.getItem(clave);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function escribir(clave: string, v: unknown[]): void {
  try {
    if (v.length) localStorage.setItem(clave, JSON.stringify(v));
    else localStorage.removeItem(clave);
  } catch { /* sin storage (modo privado): la cola vive solo en memoria */ }
}

const porHora = (a: PistolazoPendiente, b: PistolazoPendiente) => a.scannedAt.localeCompare(b.scannedAt);

/**
 * Una sola pestaña sincroniza a la vez. Con `navigator.locks` (Chrome, Safari 15.4+);
 * sin él, un "arriendo" en localStorage que vence solo si la pestaña muere.
 */
export type Candado = (fn: () => Promise<void>) => Promise<void>;

export function candadoNavegador(): Candado {
  const locks = (globalThis.navigator as Navigator & { locks?: LockManager } | undefined)?.locks;
  if (locks?.request) {
    return (fn) => locks.request(CANDADO_SYNC, { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    }) as Promise<void>;
  }
  return candadoLocalStorage();
}

/** Plan B del candado: arriendo de 60 s renovado por quien lo tiene. */
export function candadoLocalStorage(ahora: () => number = () => Date.now(), duenio = nuevoIdPistolazo()): Candado {
  const DURA_MS = 60_000;
  const leerC = (): { duenio: string; hasta: number } | null => {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_CANDADO) ?? 'null');
    } catch {
      return null;
    }
  };
  return async (fn) => {
    const c = leerC();
    if (c && c.duenio !== duenio && c.hasta > ahora()) return; // otra pestaña está sincronizando
    try {
      localStorage.setItem(CLAVE_CANDADO, JSON.stringify({ duenio, hasta: ahora() + DURA_MS }));
    } catch { /* sin storage: no hay otras pestañas con qué competir */ }
    try {
      await fn();
    } finally {
      try {
        if (leerC()?.duenio === duenio) localStorage.removeItem(CLAVE_CANDADO);
      } catch { /* sin storage */ }
    }
  };
}

/**
 * Cola de pistolazos sin internet (2026-11-21). El internet de la planta se cae
 * seguido y la producción no para: el pistolazo se manda y se espera como mucho
 * `ESPERA_SERVIDOR_MS`. Si no hay red o el servidor no contesta a tiempo, queda
 * guardado en la tablet (sobrevive a recargar) y se envía solo, en orden de hora
 * real, al volver la señal y cada `INTERVALO_SYNC_MS`. Mientras haya cola, los
 * pistolazos nuevos van directo a la cola para no adelantarse a los viejos.
 *
 * Cada pistolazo lleva su id (`clientScanId`) desde el primer intento: si la
 * petición que se dio por perdida sí llegó, el reintento no duplica el evento.
 * El primer intento NO lleva hora (manda la del servidor); la cola sí, corregida
 * con el desfase del reloj de la tablet.
 *
 * Varias pestañas: la fuente de verdad es localStorage. Cada escritura relee y
 * fusiona por id, el evento `storage` refresca las demás y un candado deja
 * sincronizar a una sola.
 */
@Injectable({ providedIn: 'root' })
export class OfflineScanQueueService implements OnDestroy {
  private readonly api = inject(FabricacionApi);

  readonly pendientes = signal<PistolazoPendiente[]>(leer<PistolazoPendiente>(CLAVE_PENDIENTES).sort(porHora));
  readonly rechazados = signal<PistolazoRechazado[]>(leer<PistolazoRechazado>(CLAVE_RECHAZADOS));
  /** Lo último que se supo de la red (evento del navegador o resultado de una petición). */
  readonly enLinea = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  readonly sincronizando = signal(false);

  /** Un pistolazo de la cola que el servidor aceptó (para actualizar el contador de hoy). */
  readonly aceptado$ = new Subject<{ item: PistolazoPendiente; resultado: AvanceResultado }>();
  /** Un pistolazo de la cola que el servidor rechazó: aviso visible y sonido. */
  readonly rechazo$ = new Subject<PistolazoRechazado>();

  /** Configurable para pruebas y para ajustar en planta. */
  esperaServidorMs = ESPERA_SERVIDOR_MS;
  esperaSyncMs = ESPERA_SYNC_MS;
  /** Reemplazable en pruebas. */
  candado: Candado = candadoNavegador();

  private intervalo: ReturnType<typeof setInterval> | null = null;
  private readonly alVolverLaRed = () => {
    this.enLinea.set(true);
    void this.sincronizar();
  };
  private readonly alPerderLaRed = () => this.enLinea.set(false);
  /** Otra pestaña cambió la cola o los rechazados. */
  private readonly alCambiarStorage = (ev: StorageEvent) => {
    if (ev.key === CLAVE_PENDIENTES || ev.key === null) this.pendientes.set(leer<PistolazoPendiente>(CLAVE_PENDIENTES).sort(porHora));
    if (ev.key === CLAVE_RECHAZADOS || ev.key === null) this.rechazados.set(leer<PistolazoRechazado>(CLAVE_RECHAZADOS));
  };

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('storage', this.alCambiarStorage);
  }

  /** Escucha la red y arranca el reintento periódico. Se llama una vez al arrancar la app. */
  iniciar(): void {
    if (this.intervalo) return;
    window.addEventListener('online', this.alVolverLaRed);
    window.addEventListener('offline', this.alPerderLaRed);
    this.intervalo = setInterval(() => {
      if (this.refrescar().length) void this.sincronizar();
    }, INTERVALO_SYNC_MS);
    if (this.pendientes().length) void this.sincronizar();
  }

  ngOnDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
    this.intervalo = null;
    window.removeEventListener('online', this.alVolverLaRed);
    window.removeEventListener('offline', this.alPerderLaRed);
    window.removeEventListener('storage', this.alCambiarStorage);
  }

  /**
   * Registra un pistolazo. `encolable: false` (una segunda o una baja, que paren
   * una reposición y piden firma) se manda normal y sin límite de espera: sin red
   * falla como siempre. Los errores de negocio (4xx) salen por el error del
   * observable, igual que antes.
   */
  registrar(scan: NuevoPistolazo, opciones: { encolable: boolean }): Observable<ResultadoPistolazo> {
    const desfase = desfaseReloj();
    const item: PistolazoPendiente = {
      ...scan,
      id: nuevoIdPistolazo(),
      scannedAt: new Date().toISOString(),
      ...(desfase != null ? { desfaseMs: desfase } : {}),
      intentos: 0,
    };
    // Una firma (usuario y clave de quien autoriza) jamás se guarda en la tablet.
    const encolable = opciones.encolable && !scan.dano?.autorizacion;
    if (encolable) {
      const cola = this.refrescar(); // otra pestaña pudo haber encolado
      const repetido = cola.find((p) => p.codigo === item.codigo && p.estacion === item.estacion);
      if (repetido) return of({ tipo: 'repetido-en-cola', item: repetido });
      // Con cola pendiente, lo nuevo va detrás: el servidor valida el orden de estaciones.
      if (cola.length) return of(this.encolar(item, 'cola'));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.enLinea.set(false);
        return of(this.encolar(item, 'sin-red'));
      }
    }
    // Envío directo: sin hora (manda la del servidor), con id por si se reintenta.
    const envio$ = this.enviar(item, false);
    if (!encolable) return envio$.pipe(map((resultado) => this.alResponder(resultado)));
    return envio$.pipe(
      timeout({ first: this.esperaServidorMs }),
      map((resultado) => this.alResponder(resultado)),
      catchError((e: unknown) => {
        if (!esFalloDeRed(e)) return throwError(() => e);
        if (!(e instanceof TimeoutError)) this.enLinea.set(false);
        return of(this.encolar(item, e instanceof TimeoutError ? 'lento' : 'sin-red'));
      }),
    );
  }

  /**
   * Envía la cola en orden de hora real, uno a uno. Aceptado: sale de la cola.
   * Rechazado por el negocio: pasa a la lista de rechazados. Sin red: la cola queda
   * intacta y se reintenta después. Un error del servidor que no es de red se
   * reintenta hasta `MAX_INTENTOS` y luego va a rechazados: la cola nunca se traba.
   */
  async sincronizar(): Promise<void> {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    try {
      await this.candado(() => this.vaciar());
    } finally {
      this.sincronizando.set(false);
    }
  }

  private async vaciar(): Promise<void> {
    for (;;) {
      const item = this.refrescar()[0];
      if (!item) return;
      try {
        const resultado = await firstValueFrom(this.enviar(item, true).pipe(timeout({ first: this.esperaSyncMs })));
        this.enLinea.set(true);
        this.quitar(item.id);
        this.aceptado$.next({ item, resultado });
      } catch (e: unknown) {
        if (esFalloDeRed(e)) {
          // Sin red: se espera lo que haga falta, la cola queda como está.
          // Sin red no cuenta como intento: el tope es para errores del servidor.
          this.enLinea.set(false);
          return;
        }
        this.enLinea.set(true);
        if (esTransitorio(e) && item.intentos + 1 < MAX_INTENTOS) {
          this.actualizar(item.id, { intentos: item.intentos + 1 });
          return;
        }
        this.quitar(item.id);
        // Un doble pistolazo no deja nada mal: ya estaba registrado.
        const cuerpo = (e as HttpErrorResponse)?.error as { motivo?: string } | null;
        if ((e as { status?: number })?.status === 409 && cuerpo?.motivo === 'REPETIDO') continue;
        const motivo = esTransitorio(e) ? `${motivoDe(e)} (falló ${MAX_INTENTOS} veces)` : motivoDe(e);
        const rechazado: PistolazoRechazado = { ...item, intentos: item.intentos + 1, motivo, rechazadoAt: new Date().toISOString() };
        this.mutar(CLAVE_RECHAZADOS, this.rechazados, (r) => (r.some((x) => x.id === rechazado.id) ? r : [...r, rechazado]));
        this.rechazo$.next(rechazado);
      }
    }
  }

  descartarRechazo(id: string): void {
    this.mutar(CLAVE_RECHAZADOS, this.rechazados, (r) => r.filter((x) => x.id !== id));
  }

  descartarRechazados(): void {
    const ids = new Set(this.rechazados().map((r) => r.id));
    this.mutar(CLAVE_RECHAZADOS, this.rechazados, (r) => r.filter((x) => !ids.has(x.id)));
  }

  private enviar(item: PistolazoPendiente, desdeCola: boolean): Observable<AvanceResultado> {
    return this.api.avanzar(item.codigo, item.operarioId, item.maquinaId, item.estacion, item.dano, true, {
      ...(desdeCola ? { scannedAt: aHoraServidor(item.scannedAt, item.desfaseMs ?? desfaseReloj()) } : {}),
      clientScanId: item.id,
    });
  }

  private alResponder(resultado: AvanceResultado): ResultadoPistolazo {
    this.enLinea.set(true);
    return { tipo: 'servidor', resultado };
  }

  private encolar(item: PistolazoPendiente, porque: 'sin-red' | 'lento' | 'cola'): ResultadoPistolazo {
    this.mutar(CLAVE_PENDIENTES, this.pendientes, (p) => (p.some((x) => x.id === item.id) ? p : [...p, item]));
    // Si es solo lentitud, la cola arranca ya; si no hay red, espera el evento online o el reintento.
    if (porque !== 'sin-red') setTimeout(() => void this.sincronizar(), 0);
    return { tipo: 'encolado', porque, pendientes: this.pendientes().length, item };
  }

  private quitar(id: string): void {
    this.mutar(CLAVE_PENDIENTES, this.pendientes, (p) => p.filter((x) => x.id !== id));
  }

  private actualizar(id: string, cambios: Partial<PistolazoPendiente>): void {
    this.mutar(CLAVE_PENDIENTES, this.pendientes, (p) => p.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  }

  /** La cola según localStorage (lo que dejaron todas las pestañas), ordenada por hora. */
  private refrescar(): PistolazoPendiente[] {
    if (hayStorage()) this.pendientes.set(leer<PistolazoPendiente>(CLAVE_PENDIENTES).sort(porHora));
    return this.pendientes();
  }

  /** Relee de localStorage, aplica el cambio y escribe: dos pestañas no se pisan. */
  private mutar<T extends { id: string }>(clave: string, sig: WritableSignal<T[]>, cambio: (actual: T[]) => T[]): void {
    const base = hayStorage() ? leer<T>(clave) : sig();
    let nuevo = cambio(base);
    if (clave === CLAVE_PENDIENTES) nuevo = [...(nuevo as unknown as PistolazoPendiente[])].sort(porHora) as unknown as T[];
    escribir(clave, nuevo);
    sig.set(nuevo);
  }
}

let storageOk: boolean | null = null;
function hayStorage(): boolean {
  if (storageOk != null) return storageOk;
  storageOk = probarStorage();
  return storageOk;
}
function probarStorage(): boolean {
  try {
    const k = '__agro_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
