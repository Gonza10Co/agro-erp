import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FacturasApi } from '../../core/api/facturas.api';
import { Factura } from '../../core/api/models/pedidos.models';

@Component({
  selector: 'app-factura-detalle',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (cargando()) { <p class="cell-sub">Cargando factura…</p> }
    @if (!cargando() && factura(); as f) {
      <div class="kv-list">
        <div class="kv"><span class="k">Factura</span><span class="v cell-mono">FAC-{{ f.consecutivo }}</span></div>
        <div class="kv"><span class="k">Cliente</span><span class="v">{{ f.despacho?.op?.oc?.cliente?.nombre }}</span></div>
        <div class="kv"><span class="k">NIT</span><span class="v cell-mono">{{ f.despacho?.op?.oc?.cliente?.nit }}</span></div>
        <div class="kv"><span class="k">Despacho</span><span class="v cell-mono">DSP-{{ f.despacho?.consecutivo }} · OP-{{ f.despacho?.op?.consecutivo }}</span></div>
        <div class="kv"><span class="k">Fecha</span><span class="v">{{ f.fecha | date:'dd/MM/yyyy' }}</span></div>
        <div class="kv"><span class="k">Estado</span><span class="v"><span class="badge badge-neutral"><span class="dot"></span>{{ f.estado }}</span></span></div>
      </div>

      <div class="drawer-section-h">Detalle</div>
      <table class="data">
        <thead><tr><th>Producto</th><th class="num">Talla</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
        <tbody>
          @for (l of f.lineas || []; track l.id) {
            <tr>
              <td>{{ l.productoConfigurado?.nombreComercial }}</td>
              <td class="num">{{ l.talla?.valor }}</td>
              <td class="num">{{ l.cantidad }}</td>
              <td class="num cell-mono">{{ moneda(l.precioUnitario) }}</td>
              <td class="num cell-mono">{{ moneda(l.subtotal) }}</td>
            </tr>
          }
        </tbody>
      </table>

      <div class="kv-list" style="margin-top:var(--sp-4);border-top:var(--bw) solid var(--border);padding-top:var(--sp-3)">
        <div class="kv"><span class="k">Subtotal</span><span class="v cell-mono">{{ moneda(f.subtotal) }}</span></div>
        <div class="kv"><span class="k">IVA ({{ pct(f.ivaPct) }}%)</span><span class="v cell-mono">{{ moneda(f.iva) }}</span></div>
        <div class="kv" style="font-weight:var(--fw-semibold)"><span class="k">Total</span><span class="v cell-mono">{{ moneda(f.total) }}</span></div>
      </div>
    }
  `,
})
export class FacturaDetalleComponent implements OnInit {
  private readonly api = inject(FacturasApi);
  private readonly destroyRef = inject(DestroyRef);
  facturaId = input.required<number>();

  factura = signal<Factura | null>(null);
  cargando = signal(true);

  ngOnInit(): void {
    this.api.obtener(this.facturaId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (f) => { this.factura.set(f); this.cargando.set(false); },
        error: () => this.cargando.set(false),
      });
  }

  moneda(n: string | number): string { return '$' + Math.round(Number(n)).toLocaleString('es-CO'); }
  pct(n: string | number): string { return String(Number(n)); }
}
