import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { OFDetalle, OFListItem } from '../../core/api/models/fabricacion.models';
import { descargarEtiquetasPdf } from './of-etiquetas-pdf';
import { agruparPrograma } from './programa-of';

@Component({
  selector: 'app-of-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Órdenes de Fabricación</div></div>
      <div class="card"><div class="card-body">
        @if (error()) {
          <div class="empty"><h4>No se pudo cargar las órdenes de fabricación</h4><p class="cell-sub">{{ error() }}</p></div>
        } @else if (ofs().length) {
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
                      <button class="btn btn-sm" type="button" [disabled]="descargando() === o.id" (click)="imprimirEtiquetas(o)">
                        {{ descargando() === o.id ? 'Generando…' : 'Etiquetas' }}
                      </button>
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

  /** PDF de etiquetas adhesivas (Code128 por par) para pegar en la canastilla/lote. */
  imprimirEtiquetas(o: OFListItem): void {
    if (this.descargando() !== null) return;
    this.descargando.set(o.id);
    this.api.obtenerOF(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (of) => {
        void descargarEtiquetasPdf(of).finally(() => this.descargando.set(null));
      },
      error: () => this.descargando.set(null), // el toast global ya avisa del HTTP
    });
  }
}
