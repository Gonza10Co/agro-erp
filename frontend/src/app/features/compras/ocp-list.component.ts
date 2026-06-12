import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpResumen } from '../../core/api/models/compras.models';
import { badgeOcp } from './ocp-badge';

@Component({
  selector: 'app-ocp-list',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Compras · Órdenes a proveedor</div></div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando órdenes…</div></div>
      } @else if (items().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6h15l-1.5 9h-12zM6 6L5 3H2M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg></span>
            <h4>Sin órdenes de compra</h4>
            <p>Generá órdenes desde un requerimiento de compra de una OP.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Orden</th><th>Proveedor</th><th>Origen</th><th>Fecha</th><th class="num">Recibido / Pedido</th><th>Avance</th><th>Estado</th></tr></thead>
              <tbody>
                @for (o of items(); track o.id) {
                  <tr class="fila-link" [routerLink]="['/compras/ordenes', o.id]">
                    <td class="cell-mono">OCP-{{ o.consecutivo }}</td>
                    <td>{{ o.proveedor.nombre }}</td>
                    <td class="cell-sub cell-mono">{{ o.requerimiento ? 'REQ-' + o.requerimiento.consecutivo : '—' }}</td>
                    <td class="cell-sub">{{ o.fecha | date:'dd/MM/yyyy' }}</td>
                    <td class="num cell-mono">{{ o.totalRecibido | number:'1.0-2' }} / {{ o.totalPedido | number:'1.0-2' }}</td>
                    <td>
                      <div class="bar"><div class="bar-fill" [style.width.%]="avance(o)"></div></div>
                    </td>
                    <td><span class="badge {{ badge(o).clase }}"><span class="dot"></span>{{ badge(o).label }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .fila-link{cursor:pointer}
    .fila-link:hover{background:color-mix(in srgb, var(--accent) 5%, transparent)}
    .bar{width:90px;height:6px;border-radius:3px;background:var(--border);overflow:hidden}
    .bar-fill{height:100%;border-radius:3px;background:var(--accent)}
  `],
})
export class OcpListComponent implements OnInit {
  private readonly api = inject(ComprasApi);
  private readonly destroyRef = inject(DestroyRef);
  items = signal<OcpResumen[]>([]);
  cargando = signal(true);

  ngOnInit(): void {
    this.api.listarOrdenes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (xs) => { this.items.set(xs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  badge(o: OcpResumen) { return badgeOcp(o.estado); }
  avance(o: OcpResumen): number {
    return o.totalPedido > 0 ? Math.min(100, (o.totalRecibido / o.totalPedido) * 100) : 0;
  }
}
