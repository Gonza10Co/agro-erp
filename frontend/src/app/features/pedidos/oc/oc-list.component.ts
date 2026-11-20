import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { EstadoDemora, OrdenCompra } from '../../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { OcDetalleComponent } from './oc-detalle.component';
import { badgeOC } from './estado-badge';
import { descargarXlsx } from '../../../shared/xlsx/xlsx-mini';
import { hojasPedidos, nombreArchivoPedidos } from './oc-export.util';
import { dispatchDetail, partialDispatch } from '../../../shared/dispatch/dispatch-labels';

@Component({
  selector: 'app-oc-list',
  standalone: true,
  imports: [DatePipe, RouterLink, DrawerComponent, OcDetalleComponent],
  template: `
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <div><div class="ph-title">Órdenes de Compra</div></div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button
            class="btn"
            type="button"
            [class.btn-primary]="soloDemoradas()"
            [disabled]="demoradas() === 0 && !soloDemoradas()"
            (click)="soloDemoradas.set(!soloDemoradas())"
            [title]="'Filtrar las órdenes quedadas (amarillas y rojas)'"
          >
            Solo demoradas ({{ demoradas() }})
          </button>
          <button
            class="btn"
            type="button"
            [class.btn-primary]="soloParciales()"
            [disabled]="parciales() === 0 && !soloParciales()"
            (click)="soloParciales.set(!soloParciales())"
            title="Pedidos a los que ya se les empezó a despachar y siguen abiertos"
          >
            Con despacho parcial ({{ parciales() }})
          </button>
          <button
            class="btn"
            type="button"
            [disabled]="descargando() || ocs().length === 0"
            (click)="descargarExcel()"
            title="Baja todos los pedidos (también los anulados) en dos hojas planas para Excel o Power Query"
          >
            {{ descargando() ? 'Preparando…' : 'Descargar Excel' }}
          </button>
          <a class="btn btn-primary" routerLink="/pedidos/oc/nueva">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva OC
          </a>
        </div>
      </div>

      @if (errorDescarga()) {
        <div style="background:color-mix(in srgb, var(--error) 8%, transparent);border:var(--bw) solid var(--error);border-radius:var(--r-md);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-4);color:var(--error)">{{ errorDescarga() }}</div>
      }

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando órdenes…</div></div>
      } @else if (ocs().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <h4>Sin órdenes de compra todavía</h4>
            <p>Las órdenes de compra aparecerán acá apenas se registren.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>OC</th><th>Cliente</th><th>Fecha</th><th>Días</th><th>Estado</th><th>OP</th></tr></thead>
              <tbody>
                @for (oc of ocsVista(); track oc.id) {
                  <tr [class.is-selected]="seleccionada()?.id === oc.id" (click)="abrir(oc)" style="cursor:pointer">
                    <td class="cell-mono">#{{ oc.consecutivo }}</td>
                    <td>{{ oc.cliente?.nombre }}</td>
                    <td class="cell-sub">{{ oc.fecha | date:'dd/MM/yyyy' }}</td>
                    <td>
                      @if (badgeDemora(oc); as d) {
                        <span class="badge {{ d.clase }}" [title]="d.titulo"><span class="dot"></span>{{ d.label }}</span>
                      } @else {
                        <span class="cell-sub">—</span>
                      }
                    </td>
                    <td>
                      <span class="badge {{ badge(oc).clase }}"><span class="dot"></span>{{ badge(oc).label }}</span>
                      @if (parcial(oc); as p) {
                        <div class="desp-parcial">
                          <span class="badge badge-accent" [title]="'Ya salió una parte del pedido: ' + detalle(p)"><span class="dot"></span>Despacho parcial</span>
                          <span class="cell-sub">{{ detalle(p) }}</span>
                        </div>
                      }
                    </td>
                    <td class="cell-sub">{{ oc.ordenProduccion ? 'OP #' + oc.ordenProduccion.consecutivo : '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="cell-sub" style="text-align:center;padding:1.25rem">
                    {{ soloDemoradas() ? 'No hay órdenes demoradas 🎉' : soloParciales() ? 'No hay pedidos con despacho parcial' : 'Sin órdenes' }}
                  </td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="!!seleccionada()" [title]="tituloDrawer()" (closed)="cerrar()">
      @if (seleccionada(); as oc) {
        <app-oc-detalle [ocId]="oc.id" (changed)="onCambio()" (eliminado)="onEliminada()" />
      }
    </app-drawer>
  `,
  styles: [`
    .desp-parcial{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);margin-top:var(--sp-1)}
  `],
})
export class OcListComponent {
  private readonly api = inject(PedidosApi);
  ocs = signal<OrdenCompra[]>([]);
  cargando = signal(true);
  seleccionada = signal<OrdenCompra | null>(null);
  soloDemoradas = signal(false);
  /** Filtro rápido: pedidos que ya empezaron a despacharse y siguen abiertos. */
  soloParciales = signal(false);
  descargando = signal(false);
  errorDescarga = signal<string | null>(null);
  tituloDrawer = computed(() => {
    const s = this.seleccionada();
    return s ? `OC #${s.consecutivo}` : '';
  });

  /** Cuántas órdenes están quedadas (amarillas o rojas). */
  demoradas = computed(
    () => this.ocs().filter((o) => o.estadoDemora === 'AMARILLO' || o.estadoDemora === 'ROJO').length,
  );

  /** Cuántos pedidos van con despacho parcial. */
  parciales = computed(() => this.ocs().filter((o) => !!partialDispatch(o.dispatch)).length);

  /** Vista de la tabla: todas, o filtradas (demoradas ordenadas por días, más quedada arriba). */
  ocsVista = computed(() => {
    let lista = this.ocs();
    if (this.soloParciales()) lista = lista.filter((o) => !!partialDispatch(o.dispatch));
    if (!this.soloDemoradas()) return lista;
    return lista
      .filter((o) => o.estadoDemora === 'AMARILLO' || o.estadoDemora === 'ROJO')
      .slice()
      .sort((a, b) => (b.diasDemora ?? 0) - (a.diasDemora ?? 0));
  });

  private readonly claseDemora: Record<EstadoDemora, string> = {
    VERDE: 'badge-success',
    AMARILLO: 'badge-warning',
    ROJO: 'badge-error',
    RETENIDA_CARTERA: 'badge-neutral',
  };

  constructor() { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.listarOC().subscribe({
      next: (os) => { this.ocs.set(os); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  /** Una sola llamada al backend con todo aplanado; el .xlsx se arma acá. */
  descargarExcel(): void {
    this.descargando.set(true);
    this.errorDescarga.set(null);
    this.api.exportarOC().subscribe({
      next: (d) => {
        descargarXlsx(nombreArchivoPedidos(), hojasPedidos(d));
        this.descargando.set(false);
      },
      error: () => {
        this.errorDescarga.set('No se pudo bajar el Excel de pedidos. Intenta de nuevo.');
        this.descargando.set(false);
      },
    });
  }

  abrir(oc: OrdenCompra): void { this.seleccionada.set(oc); }
  cerrar(): void { this.seleccionada.set(null); }
  onCambio(): void { this.cargar(); }
  // La OC ya no existe: cerrar el drawer antes de recargar (evita re-pedir un 404).
  onEliminada(): void { this.cerrar(); this.cargar(); }

  badge(oc: OrdenCompra) { return badgeOC(oc.estado); }
  parcial(oc: OrdenCompra) { return partialDispatch(oc.dispatch); }
  detalle = dispatchDetail;

  badgeDemora(oc: OrdenCompra): { clase: string; label: string; titulo: string } | null {
    if (oc.diasDemora == null || !oc.estadoDemora) return null;
    const dias = oc.diasDemora;
    if (oc.estadoDemora === 'RETENIDA_CARTERA') {
      return {
        clase: this.claseDemora.RETENIDA_CARTERA,
        label: `${dias}d · cartera`,
        titulo: `Retenida por cartera — ${dias} días desde la confirmación (no cuentan como demora)`,
      };
    }
    const titulo =
      oc.estadoDemora === 'ROJO'
        ? `Pedido quedado: ${dias} días desde la confirmación`
        : `${dias} días desde la confirmación`;
    return { clase: this.claseDemora[oc.estadoDemora], label: `${dias}d`, titulo };
  }
}
