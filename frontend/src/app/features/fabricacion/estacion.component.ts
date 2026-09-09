import { Component, DestroyRef, NgZone, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import {
  Estacion, Operario, Maquina, OFListItem, OFDetalle, ProgramaOfLinea, LABEL_CELULA,
} from '../../core/api/models/fabricacion.models';
import { LectorCamara, abrirLectorCamara, hayCamara } from './lector-camara';
import { descargarEtiquetasLengua, descargarStickerCaja, datosCajaDePar } from './etiqueta-par-pdf';

/** Lo que el dispositivo recuerda entre turnos (se configura una vez). */
export interface ConfigEstacion {
  estacion: string;
  operarioId: number;
  maquinaId?: number;
}
export const CLAVE_CONFIG = 'agro.estacion';

export function leerConfig(): ConfigEstacion | null {
  try {
    const raw = localStorage.getItem(CLAVE_CONFIG);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && typeof c.estacion === 'string' && typeof c.operarioId === 'number' ? c : null;
  } catch {
    return null;
  }
}
export function guardarConfig(c: ConfigEstacion | null): void {
  try {
    if (c) localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c));
    else localStorage.removeItem(CLAVE_CONFIG);
  } catch { /* sin storage (modo privado): la config vive solo en memoria */ }
}

/**
 * Pantalla de ESTACIÓN (piloto 2026-09-09): el celular o la tablet está amarrado
 * a UN punto de control. Cero manipulación por pistolazo: estación y operario se
 * fijan una vez por turno, la máquina es opcional, el destino lo decide el
 * sistema. En Preparación no se escanea: ahí NACEN los pares (se imprime la
 * etiqueta de la lengua contra lo programado en la OF).
 */
@Component({
  selector: 'app-estacion',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page est">
      @if (!estaciones().length && !cargando()) {
        <div class="empty"><h4>No hay estaciones activas</h4><p class="cell-sub">Configura las estaciones del piloto en el backend.</p></div>
      }

      <!-- ── Configuración del dispositivo (una vez por turno) ── -->
      @if (configurando()) {
        <div class="card"><div class="card-body config">
          <div class="ph-title">¿Qué estación es este dispositivo?</div>
          <label>Estación
            <select [(ngModel)]="selEstacion" (ngModelChange)="onEstacion()">
              @for (e of activas(); track e.codigo) { <option [value]="e.codigo">{{ e.orden }} · {{ e.nombre }}</option> }
            </select>
          </label>
          <label>Operario del turno
            <select [(ngModel)]="selOperario">
              @for (o of operarios(); track o.id) { <option [ngValue]="o.id">{{ o.nombre }}</option> }
            </select>
          </label>
          <label>Máquina (opcional)
            <select [(ngModel)]="selMaquina">
              <option [ngValue]="undefined">— sin máquina —</option>
              @for (m of maquinas(); track m.id) { <option [ngValue]="m.id">{{ m.nombre }}</option> }
            </select>
          </label>
          <div class="acciones">
            <button class="btn btn-primary" type="button" [disabled]="!selEstacion || selOperario == null" (click)="guardar()">Listo, esta es {{ nombreSel() }} ✓</button>
            @if (config()) { <button class="btn" type="button" (click)="configurando.set(false)">Cancelar</button> }
          </div>
        </div></div>
      } @else if (config()) {
        <!-- ── Cabecera fija: estación, operario y el contador de hoy ── -->
        <div class="cabecera">
          <div>
            <div class="est-nombre">{{ estacionActual()?.nombre }}</div>
            <div class="cell-sub">{{ operarioNombre() }}@if (maquinaNombre()) { · {{ maquinaNombre() }} }</div>
          </div>
          <div class="hoy">
            <div class="hoy-num">{{ hoy() }}</div>
            <div class="hoy-lbl">hoy</div>
          </div>
          <button class="btn btn-sm" type="button" title="Cambiar estación u operario" (click)="abrirConfig()">⚙</button>
        </div>

        @if (esNacimiento()) {
          <!-- ── Preparación: nacen los pares ── -->
          <div class="card"><div class="card-body">
            <label class="of-sel">Orden de fabricación
              <select [(ngModel)]="ofId" (ngModelChange)="cargarOf()">
                <option [ngValue]="undefined">— elegir OF —</option>
                @for (o of ofs(); track o.id) { <option [ngValue]="o.id">OF-{{ o.consecutivo }} · OP-{{ o.op.consecutivo }} · {{ o.estado }}</option> }
              </select>
            </label>
            @if (of(); as d) {
              <table class="tabla programa">
                <thead><tr><th>Producto</th><th>Talla</th><th class="num">Nacidos / programados</th><th class="num">Tanda</th><th></th></tr></thead>
                <tbody>
                  @for (l of d.programa ?? []; track l.productoConfiguradoId + '-' + l.tallaId) {
                    <tr [class.completa]="l.nacidos >= l.programado">
                      <td>{{ l.producto }}<div class="cell-sub">{{ l.productoCodigo }}</div></td>
                      <td class="talla">{{ l.talla }}</td>
                      <td class="num"><b>{{ l.nacidos }}</b> / {{ l.programado }}
                        <div class="barra"><div class="barra-fill" [style.width.%]="pct(l)"></div></div>
                      </td>
                      <td class="num"><input class="tanda" type="number" min="1" [max]="l.programado - l.nacidos" [(ngModel)]="tanda[clave(l)]" [disabled]="l.nacidos >= l.programado" /></td>
                      <td><button class="btn btn-primary btn-sm" type="button" [disabled]="l.nacidos >= l.programado || naciendo()" (click)="nacer(d, l)">Nacer + etiquetas 🏷️</button></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5" class="cell-sub">Esta OF no tiene producción programada.</td></tr>
                  }
                </tbody>
              </table>
            }
          </div></div>
        } @else {
          <!-- ── Cualquier otra estación: el pistolazo ── -->
          <div class="card"><div class="card-body">
            <div class="scan-fila">
              <label class="scan-label">Escanear el par
                <input #scan class="scan-input mono" [(ngModel)]="codigo" (keyup.enter)="escanear()" placeholder="OF5-0001" autofocus />
              </label>
              @if (tieneCamara) {
                <button class="btn btn-camara" type="button" (click)="camaraActiva() ? cerrarCamara() : abrirCamara()">
                  {{ camaraActiva() ? 'Cerrar cámara ✕' : 'Leer con la cámara 📷' }}
                </button>
              }
            </div>
            <div id="lector-camara" class="lector" [hidden]="!camaraActiva()"></div>
          </div></div>
        }

        <!-- ── Resultado del último pistolazo / nacimiento: grande, para verlo de reojo ── -->
        @if (resultado(); as r) {
          <div class="resultado" [class.ok]="r.ok" [class.err]="!r.ok">
            <div class="res-icono">{{ r.ok ? '✔' : '✖' }}</div>
            <div>
              <div class="res-titulo">{{ r.titulo }}</div>
              @if (r.detalle) { <div class="res-detalle">{{ r.detalle }}</div> }
              @if (r.sticker) {
                <button class="btn btn-sm" type="button" (click)="imprimirSticker(r.sticker)">Imprimir sticker de la caja 🏷️</button>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .est{max-width:720px}
    .config{display:flex;flex-direction:column;gap:var(--sp-3)}
    .config label,.scan-label,.of-sel{display:flex;flex-direction:column;gap:var(--sp-1);font-size:var(--text-caption);color:var(--text-subtle)}
    select,.scan-input,.tanda{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-body)}
    .cabecera{display:flex;align-items:center;gap:var(--sp-4);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-3);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--radius-sm)}
    .cabecera > div:first-child{flex:1;min-width:0}
    .est-nombre{font-size:var(--text-h2);font-weight:var(--fw-bold);letter-spacing:var(--ls-h2)}
    .hoy{text-align:center;padding:0 var(--sp-3)}
    .hoy-num{font-size:40px;line-height:1;font-weight:var(--fw-bold);font-variant-numeric:tabular-nums;color:var(--primary)}
    .hoy-lbl{font-size:var(--text-micro);text-transform:uppercase;letter-spacing:.08em;color:var(--text-subtle)}
    .scan-fila{display:flex;gap:var(--sp-3);align-items:flex-end;flex-wrap:wrap}
    .scan-input{font-size:var(--text-lg);min-height:52px;max-width:280px}
    .btn-camara,.btn-primary{min-height:48px}
    .lector{margin-top:var(--sp-3);width:100%;max-width:360px;border-radius:var(--radius-sm);overflow:hidden}
    .mono{font-family:var(--font-mono)}
    .acciones{display:flex;gap:var(--sp-2);flex-wrap:wrap}
    .programa{margin-top:var(--sp-3);width:100%}
    .programa .num{text-align:right;white-space:nowrap}
    .programa .talla{font-size:var(--text-h3);font-weight:var(--fw-bold)}
    .programa tr.completa td{color:var(--text-subtle)}
    .tanda{width:64px;text-align:right}
    .barra{height:4px;background:var(--inset);border-radius:2px;margin-top:var(--sp-1);overflow:hidden}
    .barra-fill{height:100%;background:var(--primary)}
    .resultado{display:flex;gap:var(--sp-4);align-items:center;margin-top:var(--sp-3);padding:var(--sp-4);border-radius:var(--radius-sm);border:2px solid transparent}
    .resultado.ok{background:var(--success-subtle);border-color:var(--success)}
    .resultado.err{background:var(--error-subtle);border-color:var(--error)}
    .res-icono{font-size:44px;line-height:1}
    .resultado.ok .res-icono{color:var(--success)} .resultado.err .res-icono{color:var(--error)}
    .res-titulo{font-size:var(--text-h2);font-weight:var(--fw-bold)}
    .res-detalle{color:var(--text-muted);margin-top:var(--sp-1)}
    @media (max-width:640px){
      .config label,.scan-label,.scan-input,.btn-camara,.acciones .btn,.of-sel{width:100%;max-width:none;min-width:0}
      .programa thead{display:none}
      .programa td{display:block;text-align:left}
      .programa .num{text-align:left}
    }
  `],
})
export class EstacionComponent implements OnInit, OnDestroy {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  readonly tieneCamara = hayCamara();
  camaraActiva = signal(false);
  private lector: LectorCamara | null = null;
  private ultimaLectura = { codigo: '', en: 0 };

  cargando = signal(true);
  estaciones = signal<Estacion[]>([]);
  activas = computed(() => this.estaciones().filter((e) => e.activa));
  config = signal<ConfigEstacion | null>(leerConfig());
  configurando = signal(false);
  operarios = signal<Operario[]>([]);
  maquinas = signal<Maquina[]>([]);
  hoy = signal(0);
  resultado = signal<{ ok: boolean; titulo: string; detalle?: string; sticker?: string } | null>(null);

  // Preparación
  ofs = signal<OFListItem[]>([]);
  of = signal<OFDetalle | null>(null);
  ofId?: number;
  tanda: Record<string, number> = {};
  naciendo = signal(false);

  // Formulario de configuración
  selEstacion = '';
  selOperario?: number;
  selMaquina?: number;
  codigo = '';

  estacionActual = computed(() => this.estaciones().find((e) => e.codigo === this.config()?.estacion));
  /** La primera estación activa es donde nacen los pares: ahí no se escanea, se imprime. */
  esNacimiento = computed(() => {
    const c = this.config();
    const primera = this.activas()[0];
    return !!c && !!primera && primera.codigo === c.estacion;
  });
  operarioNombre = computed(() => this.operarios().find((o) => o.id === this.config()?.operarioId)?.nombre ?? '');
  maquinaNombre = computed(() => this.maquinas().find((m) => m.id === this.config()?.maquinaId)?.nombre ?? '');
  nombreSel = () => this.estaciones().find((e) => e.codigo === this.selEstacion)?.nombre ?? '';

  ngOnInit(): void {
    this.api.estaciones().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (es) => {
        this.estaciones.set(es);
        this.cargando.set(false);
        const c = this.config();
        // Config guardada de una estación que ya no está activa: se vuelve a configurar.
        if (c && !es.some((e) => e.codigo === c.estacion && e.activa)) {
          this.config.set(null);
          guardarConfig(null);
        }
        if (this.config()) this.arrancar();
        else this.abrirConfig();
      },
      error: () => {
        this.cargando.set(false);
        this.resultado.set({ ok: false, titulo: 'No se pudieron cargar las estaciones', detalle: 'Revisa la conexión con el servidor.' });
      },
    });
  }

  ngOnDestroy(): void {
    void this.cerrarCamara();
  }

  abrirConfig(): void {
    const c = this.config();
    this.selEstacion = c?.estacion ?? this.activas()[0]?.codigo ?? '';
    this.selOperario = c?.operarioId;
    this.selMaquina = c?.maquinaId;
    this.configurando.set(true);
    void this.cerrarCamara();
    this.onEstacion();
  }

  /** Al cambiar la estación se recargan operarios y máquinas de SU célula. */
  onEstacion(): void {
    const est = this.estaciones().find((e) => e.codigo === this.selEstacion);
    if (!est) return;
    this.api.operarios(est.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => {
        this.operarios.set(o);
        if (!o.some((x) => x.id === this.selOperario)) this.selOperario = o[0]?.id;
      },
      error: () => this.operarios.set([]),
    });
    this.api.maquinas(est.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (m) => {
        this.maquinas.set(m);
        if (!m.some((x) => x.id === this.selMaquina)) this.selMaquina = undefined;
      },
      error: () => this.maquinas.set([]),
    });
  }

  guardar(): void {
    if (!this.selEstacion || this.selOperario == null) return;
    const c: ConfigEstacion = { estacion: this.selEstacion, operarioId: this.selOperario, maquinaId: this.selMaquina };
    this.config.set(c);
    guardarConfig(c);
    this.configurando.set(false);
    this.resultado.set(null);
    this.arrancar();
  }

  /** Con la estación fijada: contador de hoy y, si es Preparación, las OF vivas. */
  private arrancar(): void {
    const est = this.estacionActual();
    if (!est) return;
    if (!this.operarios().length) this.onEstacionActual(est);
    this.api.hoy().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (h) => this.hoy.set(h.estaciones.find((e) => e.codigo === est.codigo)?.hoy ?? 0),
      error: () => { /* el contador arranca en 0 y se corrige con el primer pistolazo */ },
    });
    if (this.esNacimiento()) {
      this.api.listarOF().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (ofs) => this.ofs.set(ofs.filter((o) => o.estado === 'ABIERTA' || o.estado === 'EN_PROCESO')),
        error: () => this.ofs.set([]),
      });
    }
  }

  private onEstacionActual(est: Estacion): void {
    this.api.operarios(est.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (o) => this.operarios.set(o), error: () => {} });
    this.api.maquinas(est.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (m) => this.maquinas.set(m), error: () => {} });
  }

  // ─────────────── Preparación: nacer pares ───────────────

  cargarOf(): void {
    this.of.set(null);
    if (this.ofId == null) return;
    this.api.obtenerOF(this.ofId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => {
        this.of.set(d);
        for (const l of d.programa ?? []) {
          const k = this.clave(l);
          if (!this.tanda[k]) this.tanda[k] = Math.min(20, Math.max(l.programado - l.nacidos, 1)); // una canasta
        }
      },
      error: () => this.resultado.set({ ok: false, titulo: 'No se pudo cargar la OF' }),
    });
  }

  clave = (l: ProgramaOfLinea) => `${l.productoConfiguradoId}-${l.tallaId}`;
  pct = (l: ProgramaOfLinea) => (l.programado ? Math.min(100, Math.round((l.nacidos / l.programado) * 100)) : 0);

  nacer(d: OFDetalle, l: ProgramaOfLinea): void {
    const c = this.config();
    if (!c) return;
    const cantidad = Math.max(1, Math.min(Number(this.tanda[this.clave(l)] || 1), l.programado - l.nacidos));
    this.naciendo.set(true);
    this.resultado.set(null);
    this.api
      .nacer(d.id, { productoConfiguradoId: l.productoConfiguradoId, tallaId: l.tallaId, cantidad, operarioId: c.operarioId, maquinaId: c.maquinaId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.naciendo.set(false);
          this.hoy.set(r.hoy);
          const primero = r.pares[0]?.codigo ?? '';
          const ultimo = r.pares[r.pares.length - 1]?.codigo ?? '';
          this.resultado.set({
            ok: true,
            titulo: `${r.pares.length} par${r.pares.length === 1 ? '' : 'es'} de talla ${l.talla} nacieron`,
            detalle: r.pares.length === 1 ? primero : `${primero} → ${ultimo} · imprimiendo etiquetas`,
          });
          void descargarEtiquetasLengua(r.pares);
          this.cargarOf();
        },
        error: (e) => {
          this.naciendo.set(false);
          this.resultado.set({ ok: false, titulo: 'No nacieron', detalle: this.msgError(e, 'No se pudo crear la tanda') });
        },
      });
  }

  // ─────────────── Cualquier otra estación: el pistolazo ───────────────

  escanear(): void {
    const c = this.config();
    const cod = this.codigo.trim();
    if (!c || !cod) return;
    this.codigo = '';
    this.api.avanzar(cod, c.operarioId, c.maquinaId, c.estacion).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.hoy.set(r.avance.hoy);
        this.resultado.set({
          ok: true,
          titulo: r.avance.terminado ? `${r.codigo} terminado ✓` : `${r.codigo} → ${r.avance.nombre}`,
          detalle: r.avance.terminado ? 'Cargado a producto terminado' : `van ${r.avance.hoy} hoy`,
          sticker: r.avance.terminado ? r.codigo : undefined,
        });
        this.reanudarCamaraConGracia();
      },
      error: (e) => {
        this.resultado.set({ ok: false, titulo: cod, detalle: this.msgError(e, 'No se pudo registrar el pistolazo') });
        this.reanudarCamaraConGracia();
      },
    });
  }

  imprimirSticker(codigo: string): void {
    this.api.par(codigo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => void descargarStickerCaja(datosCajaDePar(p)),
      error: () => this.resultado.set({ ok: false, titulo: 'No se pudo armar el sticker', detalle: codigo }),
    });
  }

  async abrirCamara(): Promise<void> {
    this.camaraActiva.set(true);
    await new Promise((r) => setTimeout(r));
    try {
      this.lector = await abrirLectorCamara('lector-camara', (codigo) => this.zone.run(() => this.onLectura(codigo)));
    } catch {
      this.camaraActiva.set(false);
      this.resultado.set({ ok: false, titulo: 'Sin cámara', detalle: 'Hace falta HTTPS y permiso de cámara en el navegador.' });
    }
  }

  async cerrarCamara(): Promise<void> {
    const lector = this.lector;
    this.lector = null;
    this.camaraActiva.set(false);
    await lector?.cerrar();
  }

  /** Una lectura por cámara = el código + Enter. Sin confirmación: una sola lectura por movimiento. */
  onLectura(codigo: string): void {
    if (!codigo) return;
    const ahora = Date.now();
    if (codigo === this.ultimaLectura.codigo && ahora - this.ultimaLectura.en < 3000) return;
    this.ultimaLectura = { codigo, en: ahora };
    this.lector?.pausar();
    this.codigo = codigo;
    this.escanear();
  }

  private reanudarCamaraConGracia(): void {
    if (!this.lector) return;
    setTimeout(() => this.lector?.reanudar(), 1500);
  }

  private msgError(e: { status?: number; error?: { message?: string | string[] } }, porDefecto: string): string {
    if (e?.status === 0) return 'Sin conexión con el servidor. Revisa la red y vuelve a intentar.';
    const m = e?.error?.message;
    return (Array.isArray(m) ? m.join(', ') : m) || porDefecto;
  }

  label = (c: keyof typeof LABEL_CELULA) => LABEL_CELULA[c];
}
