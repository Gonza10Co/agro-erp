import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { badgeOP } from '../oc/estado-badge';

@Component({
  selector: 'app-op-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Órdenes de Producción</div></div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando órdenes…</div></div>
      } @else if (ops().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <h4>Sin órdenes de producción todavía</h4>
            <p>Las órdenes de producción aparecerán acá apenas se generen desde una OC.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>OP</th><th>OC</th><th>Cliente</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                @for (op of ops(); track op.id) {
                  <tr [routerLink]="['/pedidos/op', op.id]" style="cursor:pointer">
                    <td class="cell-mono">#{{ op.consecutivo }}</td>
                    <td class="cell-sub">#{{ op.oc?.consecutivo }}</td>
                    <td>{{ op.oc?.cliente?.nombre }}</td>
                    <td class="cell-sub">{{ op.fecha | date:'dd/MM/yyyy' }}</td>
                    <td><span class="badge {{ badge(op).clase }}"><span class="dot"></span>{{ badge(op).label }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class OpListComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly destroyRef = inject(DestroyRef);

  ops = signal<OrdenProduccion[]>([]);
  cargando = signal(true);

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.listarOP()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ops) => { this.ops.set(ops); this.cargando.set(false); },
        error: () => this.cargando.set(false),
      });
  }

  badge(op: OrdenProduccion) { return badgeOP(op.estado); }
}
