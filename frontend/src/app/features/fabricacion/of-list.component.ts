import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { OFDetalle, OFListItem, ParDetalle, LABEL_CELULA } from '../../core/api/models/fabricacion.models';
import { descargarEtiquetasLengua, datosLenguaDePar } from './etiqueta-par-pdf';
import { agruparPrograma } from './programa-of';

@Component({
  selector: 'app-of-list',
  standalone: true,
  imports: [DatePipe, RouterLink, FormsModule],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Órdenes de Fabricación</div></div>
      <div class="card"><div class="card-body">
        @if (error()) {
          <div class="empty"><h4>No se pudo cargar las órdenes de fabricación</h4><p class="cell-sub">{{ error() }}</p></div>
        } @else if (ofs().length) {
          <!-- Las etiquetas NACEN en Preparación, de a tandas. Acá solo se REIMPRIME una,
               buscando el par por su código: reimprimir una OF entera pondría dos botas
               con el mismo código en la planta. -->
          <div class="reimpresion">
            <label class="rp-label">Reimprimir la etiqueta de un par
              <input class="rp-input mono" [(ngModel)]="codigoBuscado" (keyup.enter)="buscarPar()"
                     placeholder="OF1-0007" aria-label="Código del par" />
            </label>
            <button class="btn btn-sm" type="button" [disabled]="buscando() || !codigoBuscado.trim()" (click)="buscarPar()">
              {{ buscando() ? 'Buscando…' : 'Buscar' }}
            </button>
            @if (noEncontrado()) { <span class="rp-error">No existe un par con ese código.</span> }
          </div>

          @if (par(); as p) {
            <div class="rp-hallado" [class.rp-baja]="fueraDeFlujo(p)">
              <div class="rp-datos">
                <span class="rp-codigo mono">{{ p.codigo }}</span>
                <span class="rp-talla">Talla {{ p.talla.valor }}</span>
                <span class="cell-sub">{{ p.productoConfigurado?.nombreComercial }} · OF-{{ p.of.consecutivo }}</span>
                <span class="cell-sub">{{ ubicacion(p) }}</span>
              </div>
              @if (fueraDeFlujo(p)) {
                <span class="rp-aviso">Este par está {{ p.estado === 'DADO_DE_BAJA' ? 'dado de baja' : 'cancelado' }}: no debería volver a la línea.</span>
              }
              <button class="btn btn-primary btn-sm" type="button" (click)="reimprimir(p)">Imprimir esta etiqueta 🏷️</button>
              <button class="btn btn-sm" type="button" aria-label="Cerrar" (click)="limpiarBusqueda()">✕</button>
            </div>
          }

          <div class="split">
            <table class="tbl">
              <thead><tr><th>OF</th><th>OP</th><th class="num">Pares</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                @for (o of ofs(); track o.id) {
                  <tr class="fila" [class.activa]="abierta() === o.id" (click)="verDetalle(o)">
                    <td class="mono">OF-{{ o.consecutivo }}</td>
                    <td class="mono">OP-{{ o.op.consecutivo }}</td>
                    <td class="num"><b>{{ o._count.pares }}</b> / {{ o.programados }}</td>
                    <td><span class="badge" [class.badge-accent]="o.estado === 'TERMINADA'">{{ o.estado }}</span></td>
                    <td>{{ o.fecha | date:'dd MMM y' }}</td>
                    <td class="acciones" (click)="$event.stopPropagation()">
                      <a class="btn btn-sm" [routerLink]="['/fabricacion/tablero']" [queryParams]="{ ofId: o.id }">Ver tablero</a>
                      <a class="btn btn-sm" [routerLink]="['/fabricacion/of', o.id, 'consumo']">Materiales</a>

                    </td>
                  </tr>
                }
              </tbody>
            </table>

            @if (abierta()) {
              <aside class="detalle">
                <div class="det-head">
                  <div>
                    <div class="det-titulo">OF-{{ detalle()?.consecutivo ?? '' }}</div>
                    <div class="cell-sub">Composición programada</div>
                  </div>
                  <button class="btn btn-sm" type="button" aria-label="Cerrar el detalle" (click)="cerrarDetalle()">✕</button>
                </div>

                @if (cargando()) {
                  <p class="cell-sub">Cargando…</p>
                } @else {
                  @for (g of grupos(); track g.productoConfiguradoId) {
                    <div class="det-prod">
                      <div class="det-prod-nombre">{{ g.producto }}</div>
                      <div class="cell-sub mono">{{ g.productoCodigo }}</div>
                    </div>
                    <table class="det-tabla">
                      <thead><tr><th>Talla</th><th class="num">Pares</th><th class="num">Nacidos</th></tr></thead>
                      <tbody>
                        @for (l of g.lineas; track l.tallaId) {
                          <tr>
                            <td class="det-talla">{{ l.talla }}</td>
                            <td class="num">{{ l.programado }}</td>
                            <td class="num" [class.pendiente]="!l.nacidos">{{ l.nacidos }}</td>
                          </tr>
                        }
                      </tbody>
                      <tfoot><tr><th>Total</th><th class="num">{{ g.programado }}</th><th class="num">{{ g.nacidos }}</th></tr></tfoot>
                    </table>
                  } @empty {
                    <p class="cell-sub">Esta OF no tiene producción programada.</p>
                  }
                }
              </aside>
            }
          </div>
        } @else {
          <div class="empty"><h4>Sin OF todavía</h4><p class="cell-sub">Genera una OF desde el detalle de una OP con producción pendiente.</p></div>
        }
      </div></div>
    </div>
  `,
  styles: [`
    .reimpresion{display:flex;align-items:flex-end;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:var(--sp-3);padding-bottom:var(--sp-3);border-bottom:var(--bw) solid var(--border)}
    .rp-label{display:flex;flex-direction:column;gap:var(--sp-1);font-size:var(--text-caption);color:var(--text-subtle)}
    .rp-input{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-md);font-size:var(--text-body);width:180px}
    .rp-error{color:var(--error);font-size:var(--text-sm)}
    .rp-hallado{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:var(--sp-3);padding:var(--sp-3);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg)}
    .rp-hallado.rp-baja{border-color:var(--error)}
    .rp-datos{display:flex;align-items:baseline;gap:var(--sp-3);flex-wrap:wrap;flex:1;min-width:0}
    .rp-codigo{font-size:var(--text-h3);font-weight:var(--fw-bold)}
    .rp-talla{font-weight:var(--fw-bold)}
    .rp-aviso{color:var(--error);font-size:var(--text-sm)}
    .split{display:flex;align-items:flex-start;gap:var(--sp-5)}
    .split .tbl{flex:1;min-width:0}
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding:0 0 var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .tbl td{padding:var(--sp-3) var(--sp-3) var(--sp-3) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .tbl .num{text-align:right;font-variant-numeric:tabular-nums;padding-right:var(--sp-4)}
    .tbl .acciones{display:flex;gap:var(--sp-2)}
    .fila{cursor:pointer}
    .fila:hover td{background:var(--inset)}
    .fila.activa td{background:var(--primary-subtle)}
    .mono{font-family:var(--font-mono)}

    .detalle{flex:0 0 320px;position:sticky;top:var(--sp-4);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);padding:var(--sp-4);max-height:calc(100vh - 140px);overflow:auto}
    .det-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-3);margin-bottom:var(--sp-3)}
    .det-titulo{font-size:var(--text-h3);font-weight:var(--fw-bold);font-family:var(--font-mono)}
    .det-prod{margin-top:var(--sp-3)}
    .det-prod-nombre{font-weight:var(--fw-bold)}
    .det-tabla{width:100%;border-collapse:collapse;margin-top:var(--sp-2);font-size:var(--text-sm)}
    .det-tabla th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding-bottom:var(--sp-1);border-bottom:var(--bw) solid var(--border)}
    .det-tabla td{padding:var(--sp-1) 0;border-bottom:var(--bw) solid var(--border)}
    .det-tabla .num{text-align:right;font-variant-numeric:tabular-nums}
    .det-tabla .pendiente{color:var(--text-subtle)}
    .det-talla{font-weight:var(--fw-bold)}
    .det-tabla tfoot th{border-bottom:0;border-top:var(--bw) solid var(--border);padding-top:var(--sp-2);color:var(--text);font-weight:var(--fw-bold)}
    @media (max-width:900px){
      .split{flex-direction:column}
      .detalle{position:static;flex:1 1 auto;width:100%;max-height:none}
    }
  `],
})
export class OfListComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  ofs = signal<OFListItem[]>([]);
  error = signal<string | null>(null);
  // id de la OF cuyas etiquetas se están generando (deshabilita solo ese botón).
  descargando = signal<number | null>(null);
  // Reimpresión: un par que se busca por código, nunca la OF entera.
  codigoBuscado = '';
  par = signal<ParDetalle | null>(null);
  buscando = signal(false);
  noEncontrado = signal(false);
  // OF abierta en el aside: se pide el detalle porque la composición vive en la OP.
  abierta = signal<number | null>(null);
  detalle = signal<OFDetalle | null>(null);
  cargando = signal(false);
  grupos = computed(() => agruparPrograma(this.detalle()?.programa));

  ngOnInit(): void {
    this.api.listarOF().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => this.ofs.set(o),
      error: () => this.error.set('No se pudo cargar las órdenes de fabricación. Intentá de nuevo.'),
    });
  }

  /** Abre (o cierra) el aside con la composición de la OF: referencia × talla. */
  verDetalle(o: OFListItem): void {
    if (this.abierta() === o.id) return this.cerrarDetalle();
    this.abierta.set(o.id);
    this.detalle.set(null);
    this.cargando.set(true);
    this.api.obtenerOF(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (of) => {
        this.cargando.set(false);
        if (this.abierta() === o.id) this.detalle.set(of);
      },
      error: () => this.cargando.set(false), // el toast global ya avisa del HTTP
    });
  }

  cerrarDetalle(): void {
    this.abierta.set(null);
    this.detalle.set(null);
  }

  buscarPar(): void {
    const codigo = this.codigoBuscado.trim().toUpperCase();
    if (!codigo || this.buscando()) return;
    this.buscando.set(true);
    this.par.set(null);
    this.noEncontrado.set(false);
    this.api.par(codigo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => {
        this.buscando.set(false);
        this.par.set(p);
      },
      error: () => {
        this.buscando.set(false);
        this.noEncontrado.set(true);
      },
    });
  }

  limpiarBusqueda(): void {
    this.codigoBuscado = '';
    this.par.set(null);
    this.noEncontrado.set(false);
  }

  /** Una sola etiqueta de lengua (50×30, solo QR), la misma que nace en Preparación. */
  reimprimir(p: ParDetalle): void {
    void descargarEtiquetasLengua([datosLenguaDePar(p)]);
  }

  fueraDeFlujo = (p: ParDetalle) => p.estado === 'DADO_DE_BAJA' || p.estado === 'CANCELADO';

  ubicacion(p: ParDetalle): string {
    if (p.estado === 'TERMINADO') return 'Terminado';
    if (this.fueraDeFlujo(p)) return p.estado === 'DADO_DE_BAJA' ? 'Dado de baja' : 'Cancelado';
    return LABEL_CELULA[p.celulaActual];
  }
}
