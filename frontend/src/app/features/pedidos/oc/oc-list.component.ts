import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { EstadoDemora, EstadoOC, OrdenCompra, PedidosExport } from '../../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { OcDetalleComponent } from './oc-detalle.component';
import { badgeOC } from './estado-badge';
import { descargarXlsx } from '../../../shared/xlsx/xlsx-mini';
import { hojasPedidos, nombreArchivoPedidos } from './oc-export.util';
import { dispatchDetail, partialDispatch } from '../../../shared/dispatch/dispatch-labels';
import {
  EMPTY_FILTERS, FilterChip, ORDER_STATUSES, OrderFilters, activeFilterChips, applyOrderFilters,
  filterOptions, filtersFromParams, filtersToParams, isDelayed, orderTotals, removeFilter,
} from './oc-filters.util';
import { downloadOrdersPdf } from './oc-list-pdf';

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
            [class.btn-primary]="filters().delayed"
            [disabled]="demoradas() === 0 && !filters().delayed"
            (click)="setFilters({ delayed: !filters().delayed })"
            [title]="'Filtrar las órdenes quedadas (amarillas y rojas)'"
          >
            Solo demoradas ({{ demoradas() }})
          </button>
          <button
            class="btn"
            type="button"
            [class.btn-primary]="filters().partial"
            [disabled]="parciales() === 0 && !filters().partial"
            (click)="setFilters({ partial: !filters().partial })"
            title="Pedidos a los que ya se les empezó a despachar y siguen abiertos"
          >
            Con despacho parcial ({{ parciales() }})
          </button>
          <button
            class="btn"
            type="button"
            [disabled]="descargando() || ocsVista().length === 0"
            (click)="descargarExcel()"
            title="Baja los pedidos de la lista (con los filtros aplicados) en dos hojas planas para Excel o Power Query"
          >
            {{ descargando() ? 'Preparando…' : 'Descargar Excel' }}
          </button>
          <button
            class="btn"
            type="button"
            [disabled]="imprimiendo() || ocsVista().length === 0"
            (click)="imprimirPdf()"
            title="PDF de los pedidos de la lista, agrupados por cliente con subtotales"
          >
            {{ imprimiendo() ? 'Preparando…' : 'Imprimir pedidos' }}
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

      @if (!cargando() && ocs().length > 0) {
        <div class="card filters">
          <div class="filters-grid">
            <label class="f-field">
              <span>Cliente</span>
              <input class="input" type="search" list="oc-client-options" placeholder="Nombre o NIT"
                [value]="filters().client" (input)="setClient($any($event.target).value)" />
              <datalist id="oc-client-options">
                @for (c of options().clients; track c) { <option [value]="c"></option> }
              </datalist>
            </label>
            <label class="f-field">
              <span>Marca</span>
              <select class="input" (change)="setFilters({ brandId: toId($any($event.target).value) })">
                <option value="" [selected]="!filters().brandId">Todas</option>
                @for (o of options().brands; track o.id) { <option [value]="o.id" [selected]="filters().brandId === o.id">{{ o.label }}</option> }
              </select>
            </label>
            <label class="f-field">
              <span>Referencia</span>
              <select class="input" (change)="setFilters({ referenceId: toId($any($event.target).value) })">
                <option value="" [selected]="!filters().referenceId">Todas</option>
                @for (o of options().references; track o.id) { <option [value]="o.id" [selected]="filters().referenceId === o.id">{{ o.label }}</option> }
              </select>
            </label>
            <label class="f-field">
              <span>Línea</span>
              <select class="input" (change)="setFilters({ lineId: toId($any($event.target).value) })">
                <option value="" [selected]="!filters().lineId">Todas</option>
                @for (o of options().lines; track o.id) { <option [value]="o.id" [selected]="filters().lineId === o.id">{{ o.label }}</option> }
              </select>
            </label>
            <label class="f-field">
              <span>Estado</span>
              <select class="input" (change)="setFilters({ status: $any($event.target).value || null })">
                <option value="" [selected]="!filters().status">Todos</option>
                @for (e of statuses; track e) { <option [value]="e" [selected]="filters().status === e">{{ statusLabel(e) }}</option> }
              </select>
            </label>
            <div class="f-field">
              <span>Fecha del pedido</span>
              <div class="f-range">
                <input class="input" type="date" aria-label="Pedido desde" [value]="filters().orderFrom ?? ''" (change)="setFilters({ orderFrom: $any($event.target).value || null })" />
                <input class="input" type="date" aria-label="Pedido hasta" [value]="filters().orderTo ?? ''" (change)="setFilters({ orderTo: $any($event.target).value || null })" />
              </div>
            </div>
            <div class="f-field">
              <span>Fecha de entrega</span>
              <div class="f-range">
                <input class="input" type="date" aria-label="Entrega desde" [value]="filters().deliveryFrom ?? ''" (change)="setFilters({ deliveryFrom: $any($event.target).value || null })" />
                <input class="input" type="date" aria-label="Entrega hasta" [value]="filters().deliveryTo ?? ''" (change)="setFilters({ deliveryTo: $any($event.target).value || null })" />
              </div>
            </div>
          </div>
          @if (chips().length > 0) {
            <div class="chips">
              @for (c of chips(); track c.key) {
                <span class="badge badge-info chip">{{ c.label }}
                  <button type="button" class="chip-x" [attr.aria-label]="'Quitar ' + c.label" (click)="removeChip(c)">×</button>
                </span>
              }
              <button type="button" class="btn btn-sm" (click)="clearFilters()">Limpiar filtros</button>
            </div>
          }
        </div>

        <div class="totals">
          <div class="t-card"><span class="t-label">Pedidos</span><span class="t-val">{{ fmt(totals().orders) }}</span></div>
          <div class="t-card"><span class="t-label">Pares pedidos</span><span class="t-val">{{ fmt(totals().pairs) }}</span></div>
          <div class="t-card"><span class="t-label">Pares despachados</span><span class="t-val">{{ fmt(totals().dispatched) }}</span></div>
          <div class="t-card"><span class="t-label">Pares pendientes</span><span class="t-val">{{ fmt(totals().pending) }}</span></div>
        </div>
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
              <thead><tr><th>OC</th><th>Cliente</th><th>Fecha</th><th>Entrega</th><th class="num">Pares</th><th>Días</th><th>Estado</th><th>OP</th></tr></thead>
              <tbody>
                @for (oc of ocsVista(); track oc.id) {
                  <tr [class.is-selected]="seleccionada()?.id === oc.id" (click)="abrir(oc)" style="cursor:pointer">
                    <td class="cell-mono">#{{ oc.consecutivo }}</td>
                    <td>{{ oc.cliente?.nombre }}</td>
                    <td class="cell-sub">{{ oc.fecha | date:'dd/MM/yyyy' }}</td>
                    <td class="cell-sub">{{ oc.fechaEntrega ? (oc.fechaEntrega.slice(0, 10) | date:'dd/MM/yyyy') : '-' }}</td>
                    <td class="num">{{ fmt(oc.summary?.pairs ?? 0) }}</td>
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
                  <tr><td colspan="8" class="cell-sub" style="text-align:center;padding:1.25rem">
                    {{ chips().length > 0 ? 'Ningún pedido coincide con los filtros' : 'Sin órdenes' }}
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
    .filters{padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-3)}
    .filters-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:var(--sp-3)}
    .f-field{display:flex;flex-direction:column;gap:var(--sp-1);font-size:.8rem;color:var(--text-muted, inherit)}
    .f-range{display:flex;gap:var(--sp-1)}
    .f-range .input{min-width:0;flex:1}
    .chips{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);margin-top:var(--sp-3)}
    .chip{display:inline-flex;align-items:center;gap:var(--sp-1)}
    .chip-x{border:0;background:transparent;color:inherit;cursor:pointer;font-size:1rem;line-height:1;padding:0 2px}
    .totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--sp-3);margin-bottom:var(--sp-3)}
    .t-card{border:var(--bw) solid var(--border, #ddd);border-radius:var(--r-md);padding:var(--sp-2) var(--sp-3);display:flex;flex-direction:column}
    .t-label{font-size:.75rem;opacity:.75}
    .t-val{font-size:1.25rem;font-weight:600;font-variant-numeric:tabular-nums}
    td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  `],
})
export class OcListComponent {
  private readonly api = inject(PedidosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  ocs = signal<OrdenCompra[]>([]);
  cargando = signal(true);
  seleccionada = signal<OrdenCompra | null>(null);
  /** Filtros combinables; viven en la URL (query params) para compartir o volver. */
  filters = signal<OrderFilters>(filtersFromParams((k) => this.route.snapshot.queryParamMap.get(k)));
  descargando = signal(false);
  imprimiendo = signal(false);
  errorDescarga = signal<string | null>(null);
  readonly statuses = ORDER_STATUSES;
  tituloDrawer = computed(() => {
    const s = this.seleccionada();
    return s ? `OC #${s.consecutivo}` : '';
  });

  /** Cuántas órdenes están quedadas (amarillas o rojas). */
  demoradas = computed(() => this.ocs().filter(isDelayed).length);

  /** Cuántos pedidos van con despacho parcial. */
  parciales = computed(() => this.ocs().filter((o) => !!partialDispatch(o.dispatch)).length);

  options = computed(() => filterOptions(this.ocs()));
  chips = computed(() => activeFilterChips(this.filters(), this.options()));

  /** Vista de la tabla con todos los filtros (demoradas: la más quedada arriba). */
  ocsVista = computed(() => applyOrderFilters(this.ocs(), this.filters()));

  /** Totales de lo que se está viendo. */
  totals = computed(() => orderTotals(this.ocsVista()));

  setFilters(patch: Partial<OrderFilters>): void {
    this.filters.update((f) => ({ ...f, ...patch }));
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filtersToParams(this.filters()),
      replaceUrl: true,
    });
  }

  setClient(texto: string): void { this.setFilters({ client: texto }); }
  removeChip(c: FilterChip): void { this.setFilters(removeFilter(this.filters(), c.key)); }
  clearFilters(): void { this.setFilters({ ...EMPTY_FILTERS }); }
  toId(v: string): number | null { const n = Number(v); return v && Number.isInteger(n) ? n : null; }
  statusLabel(e: EstadoOC): string { return badgeOC(e).label; }
  fmt(n: number): string { return n.toLocaleString('es-CO'); }

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

  /** Una sola llamada al backend con todo aplanado; el .xlsx se arma acá con lo filtrado. */
  descargarExcel(): void {
    this.descargando.set(true);
    this.errorDescarga.set(null);
    this.api.exportarOC().subscribe({
      next: (d) => {
        descargarXlsx(nombreArchivoPedidos(), hojasPedidos(this.soloVisibles(d)));
        this.descargando.set(false);
      },
      error: () => {
        this.errorDescarga.set('No se pudo bajar el Excel de pedidos. Intenta de nuevo.');
        this.descargando.set(false);
      },
    });
  }

  /** El export trae todos los pedidos: sin filtros va completo, con filtros solo los de la lista. */
  soloVisibles(d: PedidosExport): PedidosExport {
    if (this.chips().length === 0) return d;
    const visibles = new Set(this.ocsVista().map((o) => o.consecutivo));
    return {
      pedidos: d.pedidos.filter((p) => visibles.has(p.consecutivo)),
      tallas: d.tallas.filter((t) => visibles.has(t.consecutivo)),
    };
  }

  async imprimirPdf(): Promise<void> {
    this.imprimiendo.set(true);
    this.errorDescarga.set(null);
    try {
      await downloadOrdersPdf(this.ocsVista(), this.chips().map((c) => c.label));
    } catch {
      this.errorDescarga.set('No se pudo armar el PDF de pedidos. Intenta de nuevo.');
    } finally {
      this.imprimiendo.set(false);
    }
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
