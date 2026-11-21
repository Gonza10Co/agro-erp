import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, TimeoutError, catchError, firstValueFrom, map, of, throwError, timeout } from 'rxjs';
import { FabricacionApi } from '../api/fabricacion.api';
import { AvanceResultado, DanoEscaneo } from '../api/models/fabricacion.models';

/**
 * Cuánto espera un pistolazo la respuesta del servidor antes de guardarse en la
 * cola (internet lento, 2026-11-21). La operaria no puede quedarse esperando.
 */
export const ESPERA_SERVIDOR_MS = 2000;
/** Cada cuánto se reintenta la cola mientras tenga pistolazos. */
export const INTERVALO_SYNC_MS = 30_000;
/** La sincronización va en segundo plano: ahí sí se espera más. */
export const ESPERA_SYNC_MS = 20_000;

export const CLAVE_PENDIENTES = 'agro.offlineScans.v1';
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
  /** Hora real del escaneo (ISO): es la que queda en la trazabilidad. */
  scannedAt: string;
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
 * Cola de pistolazos sin internet (2026-11-21). El internet de la planta se cae
 * seguido y la producción no para: el pistolazo se manda y se espera como mucho
 * `ESPERA_SERVIDOR_MS`. Si no hay red o el servidor no contesta a tiempo, queda
 * guardado en la tablet (sobrevive a recargar) y se envía solo, en orden de hora
 * real, al volver la señal y cada `INTERVALO_SYNC_MS`. Mientras haya cola, los
 * pistolazos nuevos van directo a la cola para no adelantarse a los viejos.
 *
 * Cada pistolazo lleva su id (`clientScanId`) desde el primer intento: si la
 * petición que se dio por perdida sí llegó, el reintento no duplica el evento.
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

  private intervalo: ReturnType<typeof setInterval> | null = null;
  private readonly alVolverLaRed = () => {
    this.enLinea.set(true);
    void this.sincronizar();
  };
  private readonly alPerderLaRed = () => this.enLinea.set(false);

  /** Escucha la red y arranca el reintento periódico. Se llama una vez al arrancar la app. */
  iniciar(): void {
    if (this.intervalo) return;
    window.addEventListener('online', this.alVolverLaRed);
    window.addEventListener('offline', this.alPerderLaRed);
    this.intervalo = setInterval(() => {
      if (this.pendientes().length) void this.sincronizar();
    }, INTERVALO_SYNC_MS);
    if (this.pendientes().length) void this.sincronizar();
  }

  ngOnDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
    this.intervalo = null;
    window.removeEventListener('online', this.alVolverLaRed);
    window.removeEventListener('offline', this.alPerderLaRed);
  }

  /**
   * Registra un pistolazo. `encolable: false` (una segunda o una baja, que paren
   * una reposición y piden firma) se manda normal y sin límite de espera: sin red
   * falla como siempre. Los errores de negocio (4xx) salen por el error del
   * observable, igual que antes.
   */
  registrar(scan: NuevoPistolazo, opciones: { encolable: boolean }): Observable<ResultadoPistolazo> {
    const item: PistolazoPendiente = { ...scan, id: nuevoIdPistolazo(), scannedAt: new Date().toISOString(), intentos: 0 };
    // Una firma (usuario y clave de quien autoriza) jamás se guarda en la tablet.
    const encolable = opciones.encolable && !scan.dano?.autorizacion;
    if (encolable) {
      const repetido = this.pendientes().find((p) => p.codigo === item.codigo && p.estacion === item.estacion);
      if (repetido) return of({ tipo: 'repetido-en-cola', item: repetido });
      // Con cola pendiente, lo nuevo va detrás: el servidor valida el orden de estaciones.
      if (this.pendientes().length) return of(this.encolar(item, 'cola'));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.enLinea.set(false);
        return of(this.encolar(item, 'sin-red'));
      }
    }
    const envio$ = this.enviar(item);
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
   * Rechazado por el negocio: pasa a la lista de rechazados. Error de red o del
   * servidor: la cola queda intacta y se reintenta después.
   */
  async sincronizar(): Promise<void> {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    try {
      for (;;) {
        const item = [...this.pendientes()].sort(porHora)[0];
        if (!item) break;
        try {
          const resultado = await firstValueFrom(this.enviar(item).pipe(timeout({ first: this.esperaSyncMs })));
          this.enLinea.set(true);
          this.quitar(item.id);
          this.aceptado$.next({ item, resultado });
        } catch (e: unknown) {
          if (esTransitorio(e)) {
            if (esFalloDeRed(e)) this.enLinea.set(false);
            this.actualizar(item.id, { intentos: item.intentos + 1 });
            break;
          }
          this.enLinea.set(true);
          this.quitar(item.id);
          // Un doble pistolazo no deja nada mal: ya estaba registrado.
          const cuerpo = (e as HttpErrorResponse)?.error as { motivo?: string } | null;
          if ((e as { status?: number })?.status === 409 && cuerpo?.motivo === 'REPETIDO') continue;
          const rechazado: PistolazoRechazado = { ...item, motivo: motivoDe(e), rechazadoAt: new Date().toISOString() };
          this.rechazados.update((r) => [...r, rechazado]);
          escribir(CLAVE_RECHAZADOS, this.rechazados());
          this.rechazo$.next(rechazado);
        }
      }
    } finally {
      this.sincronizando.set(false);
    }
  }

  descartarRechazo(id: string): void {
    this.rechazados.update((r) => r.filter((x) => x.id !== id));
    escribir(CLAVE_RECHAZADOS, this.rechazados());
  }

  descartarRechazados(): void {
    this.rechazados.set([]);
    escribir(CLAVE_RECHAZADOS, []);
  }

  private enviar(item: PistolazoPendiente): Observable<AvanceResultado> {
    return this.api.avanzar(item.codigo, item.operarioId, item.maquinaId, item.estacion, item.dano, true, {
      scannedAt: item.scannedAt,
      clientScanId: item.id,
    });
  }

  private alResponder(resultado: AvanceResultado): ResultadoPistolazo {
    this.enLinea.set(true);
    return { tipo: 'servidor', resultado };
  }

  private encolar(item: PistolazoPendiente, porque: 'sin-red' | 'lento' | 'cola'): ResultadoPistolazo {
    this.pendientes.update((p) => [...p, item].sort(porHora));
    escribir(CLAVE_PENDIENTES, this.pendientes());
    // Si es solo lentitud, la cola arranca ya; si no hay red, espera el evento online o el reintento.
    if (porque !== 'sin-red') setTimeout(() => void this.sincronizar(), 0);
    return { tipo: 'encolado', porque, pendientes: this.pendientes().length, item };
  }

  private quitar(id: string): void {
    this.pendientes.update((p) => p.filter((x) => x.id !== id));
    escribir(CLAVE_PENDIENTES, this.pendientes());
  }

  private actualizar(id: string, cambios: Partial<PistolazoPendiente>): void {
    this.pendientes.update((p) => p.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
    escribir(CLAVE_PENDIENTES, this.pendientes());
  }
}
