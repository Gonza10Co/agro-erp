import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { EstadoDemora, OrdenCompra } from '../../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { OcDetalleComponent } from './oc-detalle.component';
import { badgeOC } from './estado-badge';

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
          <a class="btn btn-primary" routerLink="/pedidos/oc/nueva">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva OC
          </a>
        </div>
      </div>

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
                    <td><span class="badge {{ badge(oc).clase }}"><span class="dot"></span>{{ badge(oc).label }}</span></td>
                    <td class="cell-sub">{{ oc.ordenProduccion ? 'OP #' + oc.ordenProduccion.consecutivo : '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="cell-sub" style="text-align:center;padding:1.25rem">
                    {{ soloDemoradas() ? 'No hay órdenes demoradas 🎉' : 'Sin órdenes' }}
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
})
export class OcListComponent {
  private readonly api = inject(PedidosApi);
  ocs = signal<OrdenCompra[]>([]);
  cargando = signal(true);
  seleccionada = signal<OrdenCompra | null>(null);
  soloDemoradas = signal(false);
  tituloDrawer = computed(() => {
    const s = this.seleccionada();
    return s ? `OC #${s.consecutivo}` : '';
  });

  /** Cuántas órdenes están quedadas (amarillas o rojas). */
  demoradas = computed(
    () => this.ocs().filter((o) => o.estadoDemora === 'AMARILLO' || o.estadoDemora === 'ROJO').length,
  );

  /** Vista de la tabla: todas, o solo las demoradas ordenadas por días (más quedada arriba). */
  ocsVista = computed(() => {
    const lista = this.ocs();
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

  abrir(oc: OrdenCompra): void { this.seleccionada.set(oc); }
  cerrar(): void { this.seleccionada.set(null); }
  onCambio(): void { this.cargar(); }
  // La OC ya no existe: cerrar el drawer antes de recargar (evita re-pedir un 404).
  onEliminada(): void { this.cerrar(); this.cargar(); }

  badge(oc: OrdenCompra) { return badgeOC(oc.estado); }

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
