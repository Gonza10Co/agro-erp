import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import {
  ParTablero, TableroResumen, Celula, LABEL_CELULA, SubPasoGuarnicion, LABEL_SUBPASO,
  SubPasoInyeccion, LABEL_SUBPASO_INYECCION,
} from '../../core/api/models/fabricacion.models';

/** Columnas que no son una célula del flujo pero sí una pila de pares que mirar. */
type ColumnaExtra = 'TERMINADOS' | 'FUERA';
type Columna = Celula | ColumnaExtra;

@Component({
  selector: 'app-fabricacion-tablero',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Tablero de fabricación</div>
        <button class="btn" (click)="cargar()">Actualizar</button>
      </div>
      @if (error()) {
        <div class="empty"><h4>No se pudo cargar el tablero</h4><p class="cell-sub">{{ error() }}</p></div>
      }
      <div class="kanban">
        @for (c of resumen()?.celulas ?? []; track c.celula) {
          <div class="col" [class.abierta]="abierta() === c.celula">
            <div class="col-h">
              <span>{{ label(c.celula) }}</span>
              @if (c.celula === 'GUARNICION') {
                <a class="sub-link" [routerLink]="['/fabricacion/guarnicion']" [queryParams]="ofId ? { ofId } : {}">sub-pasos →</a>
              }
            </div>
            <button class="col-num" type="button" [disabled]="!c.total" (click)="abrir(c.celula)">
              <span class="num">{{ c.total }}</span>
              <span class="barra"><span class="barra-fill" [style.width.%]="pct(c.total)"></span></span>
            </button>
            @if (c.tallas.length) {
              <div class="tallas">
                @for (t of c.tallas; track t.talla) {
                  <span class="talla-chip"><b>{{ t.talla }}</b> {{ t.cantidad }}</span>
                }
              </div>
            }
          </div>
        }

        <div class="col col-done" [class.abierta]="abierta() === 'TERMINADOS'">
          <div class="col-h"><span>Terminados</span></div>
          <button class="col-num" type="button" [disabled]="!resumen()?.terminados" (click)="abrir('TERMINADOS')">
            <span class="num acento">{{ resumen()?.terminados ?? 0 }}</span>
            <span class="barra"><span class="barra-fill acento-bg" [style.width.%]="pct(resumen()?.terminados ?? 0)"></span></span>
          </button>
        </div>
      </div>

      @if (resumen(); as r) {
        <div class="pie">
          <span>{{ r.total }} pares en la orden</span>
          @if (r.fueraDeFlujo) {
            <button class="fuera-link" type="button" (click)="abrir('FUERA')">
              {{ r.fueraDeFlujo }} fuera de flujo (bajas y cancelados)
            </button>
          }
        </div>
      }

      <!-- El detalle no se trae hasta que alguien abre una columna: un día son ~1.206 pares. -->
      @if (abierta(); as col) {
        <div class="detalle">
          <div class="det-h">
            <span class="det-titulo">{{ tituloColumna(col) }}</span>
            <span class="cell-sub">{{ pares().length }} {{ pares().length === 1 ? 'par' : 'pares' }}{{ hayMas() ? ' (primeros ' + tope + ')' : '' }}</span>
            <button class="btn btn-sm" type="button" aria-label="Cerrar el detalle" (click)="cerrar()">✕</button>
          </div>
          @if (cargandoDetalle()) {
            <p class="cell-sub">Cargando…</p>
          } @else {
            <div class="det-body">
              @for (p of pares(); track p.id) {
                <a class="par-chip" [class.chip-baja]="p.estado === 'DADO_DE_BAJA'"
                   [routerLink]="['/fabricacion/par', p.codigo]">
                  <span class="mono">{{ p.codigo }}</span>
                  <span class="cell-sub">T{{ p.talla.valor }}</span>
                  @if (p.celulaActual === 'GUARNICION' && p.subPasoActual) {
                    <span class="cell-sub">{{ subPasoLabel(p.subPasoActual) }}</span>
                  }
                  @if (p.celulaActual === 'INYECCION' && p.subPasoInyeccion) {
                    <span class="cell-sub">{{ subPasoInyeccionLabel(p.subPasoInyeccion) }}</span>
                  }
                  @if (col === 'FUERA') {
                    <span class="estado">{{ p.estado === 'DADO_DE_BAJA' ? 'baja ✖' : 'cancelado' }}</span>
                  }
                </a>
              } @empty {
                <div class="cell-sub">Sin pares en esta columna.</div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .kanban{display:grid;grid-template-columns:repeat(6,1fr);gap:var(--sp-3);align-items:start}
    .col{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);overflow:hidden}
    .col.abierta{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}
    .col-h{display:flex;justify-content:space-between;align-items:center;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);border-bottom:var(--bw) solid var(--border);font-weight:var(--fw-medium);font-size:var(--text-sm)}
    .col-num{display:block;width:100%;padding:var(--sp-3);background:none;border:0;cursor:pointer;text-align:center;font:inherit;color:inherit}
    .col-num:disabled{cursor:default;opacity:.45}
    .col-num:not(:disabled):hover{background:var(--inset)}
    .num{display:block;font-size:38px;line-height:1;font-weight:var(--fw-bold);font-variant-numeric:tabular-nums;color:var(--primary)}
    .num.acento{color:var(--accent)}
    .barra{display:block;height:4px;margin-top:var(--sp-2);background:var(--inset);border-radius:2px;overflow:hidden}
    .barra-fill{display:block;height:100%;background:var(--primary)}
    .barra-fill.acento-bg{background:var(--accent)}
    .tallas{display:flex;flex-wrap:wrap;gap:var(--sp-1);padding:0 var(--sp-2) var(--sp-2)}
    .talla-chip{font-size:var(--text-micro);color:var(--text-muted);background:var(--inset);border-radius:var(--r-sm);padding:2px 6px;font-variant-numeric:tabular-nums}
    .talla-chip b{color:var(--text)}
    .sub-link{font-size:var(--text-caption);color:var(--accent);text-decoration:none}
    .sub-link:hover{text-decoration:underline}

    .pie{display:flex;gap:var(--sp-4);align-items:baseline;margin-top:var(--sp-3);font-size:var(--text-sm);color:var(--text-muted)}
    .fuera-link{background:none;border:0;padding:0;font:inherit;color:var(--danger);cursor:pointer;text-decoration:underline}

    .detalle{margin-top:var(--sp-3);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);padding:var(--sp-3)}
    .det-h{display:flex;align-items:baseline;gap:var(--sp-3);margin-bottom:var(--sp-3)}
    .det-titulo{font-weight:var(--fw-bold)}
    .det-h .btn{margin-left:auto}
    .det-body{display:flex;flex-wrap:wrap;gap:var(--sp-2)}
    .par-chip{display:flex;gap:var(--sp-2);padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-md);font-size:var(--text-caption);text-decoration:none;color:inherit}
    .par-chip:hover{border-color:var(--accent)}
    .chip-baja{border-color:var(--danger)}
    .chip-baja .estado{color:var(--danger)}
    .mono{font-family:var(--font-mono)}
    @media (max-width:900px){ .kanban{grid-template-columns:repeat(2,1fr)} }
  `],
})
export class FabricacionTableroComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Tope del detalle: una columna puede tener cientos de pares en un día normal. */
  readonly tope = 200;
  label = (c: Celula) => LABEL_CELULA[c];
  subPasoLabel = (s: SubPasoGuarnicion) => LABEL_SUBPASO[s];
  subPasoInyeccionLabel = (s: SubPasoInyeccion) => LABEL_SUBPASO_INYECCION[s];

  resumen = signal<TableroResumen | null>(null);
  error = signal<string | null>(null);
  abierta = signal<Columna | null>(null);
  pares = signal<ParTablero[]>([]);
  cargandoDetalle = signal(false);
  protected ofId?: number;

  hayMas = computed(() => this.pares().length >= this.tope);

  /** La barra de cada columna se lee contra la columna más cargada del tablero. */
  private mayor = computed(() => {
    const r = this.resumen();
    if (!r) return 0;
    return Math.max(...r.celulas.map((c) => c.total), r.terminados, 1);
  });
  pct = (n: number) => Math.round((n / this.mayor()) * 100);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('ofId');
    this.ofId = q ? Number(q) : undefined;
    this.cargar();
  }

  cargar(): void {
    this.error.set(null);
    this.api.tableroResumen(this.ofId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.resumen.set(r);
        const col = this.abierta();
        if (col) this.pedirDetalle(col);
      },
      error: () => this.error.set('No se pudo cargar el tablero. Intentá de nuevo.'),
    });
  }

  abrir(col: Columna): void {
    if (this.abierta() === col) return this.cerrar();
    this.abierta.set(col);
    this.pedirDetalle(col);
  }

  cerrar(): void {
    this.abierta.set(null);
    this.pares.set([]);
  }

  tituloColumna(col: Columna): string {
    if (col === 'TERMINADOS') return 'Terminados';
    if (col === 'FUERA') return 'Fuera de flujo';
    return LABEL_CELULA[col];
  }

  private pedirDetalle(col: Columna): void {
    this.cargandoDetalle.set(true);
    this.pares.set([]);
    const filtro =
      col === 'TERMINADOS'
        ? { estados: ['TERMINADO'], take: this.tope }
        : col === 'FUERA'
          ? { estados: ['DADO_DE_BAJA', 'CANCELADO'], take: this.tope }
          : { celula: col, estados: ['EN_PROCESO'], take: this.tope };
    this.api.tablero(this.ofId, filtro).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        this.cargandoDetalle.set(false);
        if (this.abierta() === col) this.pares.set(p);
      },
      error: () => this.cargandoDetalle.set(false), // el toast global ya avisa del HTTP
    });
  }
}
