import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FacturasApi } from '../../core/api/facturas.api';
import { Factura } from '../../core/api/models/pedidos.models';
import { deliveryLabel, partialDispatchLabel } from '../../shared/dispatch/dispatch-labels';
import { AuthService } from '../../core/auth/auth.service';
import { puedeVerSeccion } from '../../core/auth/modulos';
import { buildInvoicePdf } from './invoice-pdf.util';

@Component({
  selector: 'app-factura-detalle',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (cargando()) { <p class="cell-sub">Cargando factura…</p> }
    @if (!cargando() && factura(); as f) {
      <div class="kv-list">
        <div class="kv"><span class="k">Factura</span><span class="v cell-mono">FAC-{{ f.consecutivo }}</span></div>
        <div class="kv"><span class="k">Cliente</span><span class="v">{{ f.cliente?.nombre ?? f.despacho?.op?.oc?.cliente?.nombre }}</span></div>
        <div class="kv"><span class="k">NIT</span><span class="v cell-mono">{{ f.cliente?.nit ?? f.despacho?.op?.oc?.cliente?.nit }}</span></div>
        @if (f.despacho; as d) {
          <div class="kv"><span class="k">Despacho</span><span class="v cell-mono">DSP-{{ d.consecutivo }} · OP-{{ d.op?.consecutivo }}</span></div>
        }
        @if (entrega(); as e) {
          <div class="kv"><span class="k">Entrega</span><span class="v"><span class="badge" [class.badge-success]="f.despacho?.isFinal" [class.badge-accent]="!f.despacho?.isFinal"><span class="dot"></span>{{ e }}</span>
            @if (parcial(); as p) { <span class="badge badge-accent"><span class="dot"></span>{{ p }}</span> }
          </span></div>
        }
        <div class="kv"><span class="k">Fecha</span><span class="v">{{ f.fecha | date:'dd/MM/yyyy' }}</span></div>
        <div class="kv"><span class="k">Estado</span><span class="v"><span class="badge badge-neutral"><span class="dot"></span>{{ f.estado }}</span></span></div>
      </div>

      <div class="drawer-section-h">Detalle</div>
      <table class="data">
        <thead><tr><th>Producto</th><th class="num">Talla</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
        <tbody>
          @for (l of f.lineas || []; track l.id) {
            <tr>
              <td>{{ l.productoConfigurado?.nombreComercial ?? l.servicio?.nombre ?? l.descripcion }}</td>
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

      @if (puedeVerPdf) {
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:var(--sp-2);margin-top:var(--sp-4)">
          @if (error()) { <span class="cell-sub">{{ error() }}</span> }
          <button class="btn btn-accent" type="button" [class.is-loading]="generandoPdf()" [disabled]="generandoPdf()" (click)="descargarPdf()">Descargar PDF</button>
        </div>
      }
    }
  `,
})
export class FacturaDetalleComponent implements OnInit {
  private readonly api = inject(FacturasApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  readonly puedeVerPdf = puedeVerSeccion(this.auth.rol(), 'factura-pdf');
  facturaId = input.required<number>();

  factura = signal<Factura | null>(null);
  cargando = signal(true);
  generandoPdf = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.api.obtener(this.facturaId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (f) => { this.factura.set(f); this.cargando.set(false); },
        error: () => this.cargando.set(false),
      });
  }

  /** Número de entrega del despacho facturado ("Entrega 2", "Entrega 3 (final)"). */
  entrega(): string | null {
    const d = this.factura()?.despacho;
    return d ? deliveryLabel(d.deliveryNumber, d.isFinal) : null;
  }

  /** "Despacho parcial" cuando el despacho facturado no cerró el pedido. */
  parcial(): string | null {
    const d = this.factura()?.despacho;
    return d ? partialDispatchLabel(d.deliveryNumber, d.isFinal) : null;
  }

  async descargarPdf(): Promise<void> {
    const f = this.factura();
    if (!f || this.generandoPdf()) return;
    this.generandoPdf.set(true);
    this.error.set('');
    try {
      const { downloadInvoicePdf } = await import('./invoice-pdf');
      await downloadInvoicePdf(buildInvoicePdf(f));
    } catch {
      this.error.set('No se pudo generar el PDF');
    } finally {
      this.generandoPdf.set(false);
    }
  }

  moneda(n: string | number): string { return '$' + Math.round(Number(n)).toLocaleString('es-CO'); }
  pct(n: string | number): string { return String(Number(n)); }
}
