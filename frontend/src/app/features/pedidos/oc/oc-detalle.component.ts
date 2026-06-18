import { Component, OnInit, inject, input, output, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenCompra, OCLinea, EstadoOP } from '../../../core/api/models/pedidos.models';
import { badgeOC, badgeOP } from './estado-badge';

interface LineaEdit {
  productoConfiguradoId: number;
  nombre: string;
  codigo: string;
  precioUnitario: number | null;
  tallas: { tallaId: number; valor: number; cantidad: number }[];
}

@Component({
  selector: 'app-oc-detalle',
  standalone: true,
  imports: [DatePipe, RouterLink, FormsModule],
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
          <div class="kv"><span class="k">Orden de producción</span><span class="v">OP #{{ op.consecutivo }} <span class="badge {{ badgeOp(op.estado).clase }}"><span class="dot"></span>{{ badgeOp(op.estado).label }}</span></span></div>
        }
      </div>

      <div class="drawer-section-h">Líneas</div>

      @if (!editando()) {
        @for (l of o.lineas || []; track l.id) {
          <div style="margin-bottom:var(--sp-4)">
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:var(--fw-medium);margin-bottom:var(--sp-2)">
              <span>{{ l.productoConfigurado?.nombreComercial }}
                <span class="cell-sub cell-mono">{{ l.productoConfigurado?.codigo }}</span></span>
              <span class="cell-sub cell-mono">{{ l.precioUnitario ? (moneda(precio(l)) + ' /par') : 'sin precio' }}</span>
            </div>
            <table class="data">
              <thead><tr><th>Talla</th><th class="num">Cantidad</th></tr></thead>
              <tbody>
                @for (t of l.tallas; track t.id) {
                  <tr><td>{{ t.talla?.valor }}</td><td class="num">{{ t.cantidad }}</td></tr>
                }
              </tbody>
            </table>
            <div class="kv" style="font-weight:var(--fw-medium)"><span class="k">Subtotal línea</span><span class="v cell-mono">{{ moneda(subtotalLinea(l)) }}</span></div>
          </div>
        }
        <div class="kv" style="font-weight:var(--fw-semibold);border-top:var(--bw) solid var(--border);padding-top:var(--sp-3)">
          <span>Total OC (sin IVA)</span><span class="cell-mono">{{ moneda(totalOC()) }}</span>
        </div>
      } @else {
        <!-- Modo edición: ajustar cantidades y precios (solo en BORRADOR) -->
        <div class="field" style="margin-bottom:var(--sp-4)">
          <label class="label">Observaciones</label>
          <input class="input" [(ngModel)]="edObs" name="edObs" />
        </div>
        @for (le of edLineas(); track le.productoConfiguradoId) {
          <div style="margin-bottom:var(--sp-4)">
            <div style="display:flex;justify-content:space-between;align-items:center;font-weight:var(--fw-medium);margin-bottom:var(--sp-2);gap:var(--sp-3)">
              <span>{{ le.nombre }} <span class="cell-sub cell-mono">{{ le.codigo }}</span></span>
              <span class="cell-sub">Precio/par <input type="number" min="0" step="1000" style="width:110px" class="input" [(ngModel)]="le.precioUnitario" [name]="'precio'+le.productoConfiguradoId" /></span>
            </div>
            <table class="data">
              <thead><tr><th>Talla</th><th class="num">Cantidad</th></tr></thead>
              <tbody>
                @for (t of le.tallas; track t.tallaId) {
                  <tr><td>{{ t.valor }}</td><td class="num"><input type="number" min="0" style="width:90px;text-align:right" class="input" [(ngModel)]="t.cantidad" [name]="'cant'+le.productoConfiguradoId+'_'+t.tallaId" /></td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      }

      @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin:var(--sp-3) 0">{{ error() }}</p> }

      @if (o.estado === 'BORRADOR' && editando()) {
        <div class="drawer-foot" style="gap:var(--sp-2)">
          <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="guardarEdicion()">Guardar cambios</button>
          <button class="btn btn-ghost" type="button" [disabled]="accion()" (click)="cancelarEdicion()">Cancelar</button>
        </div>
      } @else if (o.estado === 'BORRADOR') {
        <div class="drawer-foot" style="gap:var(--sp-2)">
          <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="confirmar()">Confirmar OC</button>
          <button class="btn btn-ghost" type="button" [disabled]="accion()" (click)="entrarEdicion()">Editar</button>
        </div>
      } @else if (o.estado === 'CONFIRMADA') {
        <div class="drawer-foot">
          <button class="btn btn-accent" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="generarOP()">Generar OP</button>
        </div>
      }

      @if (o.ordenProduccion; as op) {
        <div class="drawer-foot">
          <a class="btn btn-primary btn-block" [routerLink]="['/pedidos/op', op.id]">Ver orden de producción · OP #{{ op.consecutivo }}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        </div>
      }
    }
  `,
})
export class OcDetalleComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly destroyRef = inject(DestroyRef);
  ocId = input.required<number>();
  changed = output<void>();

  oc = signal<OrdenCompra | null>(null);
  cargando = signal(true);
  accion = signal(false);
  error = signal('');

  // Edición inline (cantidades/precios) de una OC en BORRADOR.
  editando = signal(false);
  edLineas = signal<LineaEdit[]>([]);
  edObs = '';

  ngOnInit(): void { this.cargar(); }

  entrarEdicion(): void {
    const o = this.oc();
    if (!o) return;
    this.edObs = o.observaciones ?? '';
    this.edLineas.set(
      (o.lineas ?? []).map((l) => ({
        productoConfiguradoId: l.productoConfiguradoId,
        nombre: l.productoConfigurado?.nombreComercial ?? '',
        codigo: l.productoConfigurado?.codigo ?? '',
        precioUnitario: l.precioUnitario != null ? Number(l.precioUnitario) : null,
        tallas: l.tallas.map((t) => ({ tallaId: t.tallaId, valor: t.talla?.valor ?? 0, cantidad: t.cantidad })),
      })),
    );
    this.error.set('');
    this.editando.set(true);
  }

  cancelarEdicion(): void { this.editando.set(false); }

  guardarEdicion(): void {
    const o = this.oc();
    if (!o || this.accion()) return;
    this.accion.set(true); this.error.set('');
    const dto = {
      clienteId: o.clienteId,
      observaciones: this.edObs.trim() || undefined,
      lineas: this.edLineas().map((le) => ({
        productoConfiguradoId: le.productoConfiguradoId,
        precioUnitario: le.precioUnitario != null ? Number(le.precioUnitario) : undefined,
        tallas: le.tallas
          .filter((t) => Number(t.cantidad) > 0)
          .map((t) => ({ tallaId: t.tallaId, cantidad: Number(t.cantidad) })),
      })).filter((l) => l.tallas.length > 0),
    };
    this.api.actualizarOC(this.ocId(), dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.accion.set(false); this.editando.set(false); this.cargar(); this.changed.emit(); },
        error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
      });
  }

  cargar(): void {
    this.cargando.set(true);
    this.oc.set(null);
    this.api.obtenerOC(this.ocId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (o) => { this.oc.set(o); this.cargando.set(false); },
        error: () => this.cargando.set(false),
      });
  }

  confirmar(): void {
    if (this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.confirmarOC(this.ocId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.accion.set(false); this.cargar(); this.changed.emit(); },
        error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
      });
  }

  generarOP(): void {
    if (this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.generarOP(this.ocId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.accion.set(false); this.cargar(); this.changed.emit(); },
        error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
      });
  }

  badge(o: OrdenCompra) { return badgeOC(o.estado); }
  badgeOp(estado: EstadoOP) { return badgeOP(estado); }

  precio(l: OCLinea): number { return Number(l.precioUnitario ?? 0); }
  subtotalLinea(l: OCLinea): number {
    const pares = l.tallas.reduce((acc, t) => acc + t.cantidad, 0);
    return pares * this.precio(l);
  }
  totalOC(): number { return (this.oc()?.lineas ?? []).reduce((acc, l) => acc + this.subtotalLinea(l), 0); }
  moneda(n: number): string { return '$' + Math.round(n).toLocaleString('es-CO'); }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
