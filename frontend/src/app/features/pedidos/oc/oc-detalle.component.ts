import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenCompra } from '../../../core/api/models/pedidos.models';
import { badgeOC, badgeOP } from './estado-badge';

@Component({
  selector: 'app-oc-detalle',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (cargando()) {
      <p class="cell-sub">Cargando orden…</p>
    }
    @if (!cargando() && oc(); as o) {
      <div class="kv-list">
        <div class="kv"><span class="k">Cliente</span><span class="v">{{ o.cliente?.nombre }}</span></div>
        <div class="kv"><span class="k">NIT</span><span class="v cell-mono">{{ o.cliente?.nit }}</span></div>
        <div class="kv"><span class="k">OC cliente</span><span class="v">{{ o.ocCliente || '—' }}</span></div>
        <div class="kv"><span class="k">Fecha</span><span class="v">{{ o.fecha | date:'dd/MM/yyyy' }}</span></div>
        <div class="kv"><span class="k">Estado</span><span class="v"><span class="badge {{ badge(o).clase }}"><span class="dot"></span>{{ badge(o).label }}</span></span></div>
        @if (o.ordenProduccion; as op) {
          <div class="kv"><span class="k">Orden de producción</span><span class="v">OP #{{ op.consecutivo }} · {{ badgeOpLabel(op.estado) }}</span></div>
        }
      </div>

      <div class="drawer-section-h">Líneas</div>
      @for (l of o.lineas || []; track l.id) {
        <div style="margin-bottom:var(--sp-4)">
          <div style="font-weight:var(--fw-medium);margin-bottom:var(--sp-2)">
            {{ l.productoConfigurado?.nombreComercial }}
            <span class="cell-sub cell-mono">{{ l.productoConfigurado?.codigo }}</span>
          </div>
          <table class="data">
            <thead><tr><th>Talla</th><th class="num">Cantidad</th></tr></thead>
            <tbody>
              @for (t of l.tallas; track t.id) {
                <tr><td>{{ t.talla?.valor }}</td><td class="num">{{ t.cantidad }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin:var(--sp-3) 0">{{ error() }}</p> }

      @if (o.estado === 'BORRADOR' || o.estado === 'CONFIRMADA') {
        <div class="drawer-foot">
          @if (o.estado === 'BORRADOR') {
            <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="confirmar()">Confirmar OC</button>
          }
          @if (o.estado === 'CONFIRMADA') {
            <button class="btn btn-accent" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="generarOP()">Generar OP</button>
          }
        </div>
      }
    }
  `,
})
export class OcDetalleComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  ocId = input.required<number>();
  changed = output<void>();

  oc = signal<OrdenCompra | null>(null);
  cargando = signal(true);
  accion = signal(false);
  error = signal('');

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.obtenerOC(this.ocId()).subscribe({
      next: (o) => { this.oc.set(o); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  confirmar(): void {
    if (this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.confirmarOC(this.ocId()).subscribe({
      next: () => { this.accion.set(false); this.cargar(); this.changed.emit(); },
      error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }

  generarOP(): void {
    if (this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.generarOP(this.ocId()).subscribe({
      next: () => { this.accion.set(false); this.cargar(); this.changed.emit(); },
      error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }

  badge(o: OrdenCompra) { return badgeOC(o.estado); }
  badgeOpLabel(estado: 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'ANULADA') { return badgeOP(estado).label; }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
