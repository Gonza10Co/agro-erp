import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FacturasApi } from '../../core/api/facturas.api';
import { FacturaListItem } from '../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { FacturaDetalleComponent } from './factura-detalle.component';

@Component({
  selector: 'app-facturas-list',
  standalone: true,
  imports: [DatePipe, DrawerComponent, FacturaDetalleComponent],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Facturas</div></div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando facturas…</div></div>
      } @else if (facturas().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <h4>Sin facturas todavía</h4>
            <p>Las facturas aparecerán acá cuando se facture un despacho.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Factura</th><th>Cliente</th><th>OP</th><th>Fecha</th><th class="num">Total</th><th>Estado</th></tr></thead>
              <tbody>
                @for (f of facturas(); track f.id) {
                  <tr [class.is-selected]="seleccionada()?.id === f.id" (click)="abrir(f)" style="cursor:pointer">
                    <td class="cell-mono">FAC-{{ f.consecutivo }}</td>
                    <td>{{ f.despacho.op.oc.cliente.nombre }}</td>
                    <td class="cell-sub cell-mono">OP-{{ f.despacho.op.consecutivo }}</td>
                    <td class="cell-sub">{{ f.fecha | date:'dd/MM/yyyy' }}</td>
                    <td class="num cell-mono">{{ moneda(f.total) }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ f.estado }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="!!seleccionada()" [title]="tituloDrawer()" (closed)="cerrar()">
      @if (seleccionada(); as f) {
        <app-factura-detalle [facturaId]="f.id" />
      }
    </app-drawer>
  `,
})
export class FacturasListComponent implements OnInit {
  private readonly api = inject(FacturasApi);
  private readonly destroyRef = inject(DestroyRef);
  facturas = signal<FacturaListItem[]>([]);
  cargando = signal(true);
  seleccionada = signal<FacturaListItem | null>(null);
  tituloDrawer = computed(() => {
    const s = this.seleccionada();
    return s ? `Factura FAC-${s.consecutivo}` : '';
  });

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (fs) => { this.facturas.set(fs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(f: FacturaListItem): void { this.seleccionada.set(f); }
  cerrar(): void { this.seleccionada.set(null); }
  moneda(n: string | number): string { return '$' + Math.round(Number(n)).toLocaleString('es-CO'); }
}
