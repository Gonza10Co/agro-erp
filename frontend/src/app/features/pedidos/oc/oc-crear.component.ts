import { Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientesApi } from '../../../core/api/clientes.api';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { CatalogoApi } from '../../../core/api/catalogo.api';
import { Cliente, Talla } from '../../../core/api/models/pedidos.models';
import { ProductoConfiguradoFull } from '../../../core/api/models/catalogo.models';
import { BuscadorSelectComponent } from '../../../shared/ui/buscador-select/buscador-select.component';
import { TallaGridComponent } from '../../../shared/ui/talla-grid/talla-grid.component';
import { LineaWizard, tallasDeProducto, construirDto } from './oc-crear.util';
import { totalCurva } from '../../../shared/ui/talla-grid/curva.util';

@Component({
  selector: 'app-oc-crear',
  standalone: true,
  imports: [FormsModule, BuscadorSelectComponent, TallaGridComponent],
  template: `
    <div class="page" style="max-width:920px;margin:0 auto">
      <div class="page-header">
        <div><div class="ph-title">Nueva Orden de Compra</div></div>
      </div>

      <!-- STEPPER -->
      <div class="card" style="padding:var(--sp-4) var(--sp-5);margin-bottom:var(--sp-5)">
        <div class="wz-steps">
          @for (s of pasosLabels; track $index) {
            <div class="wz-step" [class.is-active]="paso() === $index" [class.is-done]="paso() > $index">
              <span class="wz-marker">{{ $index + 1 }}</span><span class="wz-label">{{ s }}</span>
            </div>
          }
        </div>
      </div>

      <div class="card"><div class="card-body">
        <!-- PASO 0: CLIENTE -->
        @if (paso() === 0) {
          <div class="panel-title">Cliente</div>
          <label class="label">Cliente <span style="color:var(--accent)">*</span></label>
          <app-buscador-select [items]="clientes()" [etiqueta]="nombreCliente" [sub]="nitCliente"
            placeholder="Buscar cliente…" (seleccionar)="clienteSel.set($event)" />
          @if (clienteSel(); as cl) { <p class="cell-sub" style="margin-top:var(--sp-2)">Seleccionado: <b>{{ cl.nombre }}</b> · {{ cl.nit }}</p> }
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-top:var(--sp-4)">
            <div><label class="label">OC del cliente (opcional)</label><input class="input" [ngModel]="ocCliente()" (ngModelChange)="ocCliente.set($event)" /></div>
            <div><label class="label">Observaciones (opcional)</label><input class="input" [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" /></div>
          </div>
        }

        <!-- PASO 1: PRODUCTOS -->
        @if (paso() === 1) {
          <div class="panel-title">Productos</div>
          <app-buscador-select [items]="productosDisponibles()" [etiqueta]="nombreProducto" [sub]="codigoProducto"
            placeholder="Buscar producto…" (seleccionar)="agregarProducto($event)" />
          <div style="margin-top:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2)">
            @for (l of lineas(); track l.producto.id) {
              <div class="kv"><span class="v"><b>{{ l.producto.nombreComercial }}</b> <span class="cell-sub cell-mono">{{ l.producto.codigo }}</span></span>
                <button class="btn btn-ghost btn-sm" type="button" (click)="quitarProducto(l.producto.id)">Quitar</button></div>
            }
            @if (!lineas().length) { <p class="cell-sub">Agregá al menos un producto.</p> }
          </div>
        }

        <!-- PASO 2: CURVA -->
        @if (paso() === 2) {
          <div class="panel-title">Curva de tallas</div>
          @for (l of lineas(); track l.producto.id) {
            <div style="margin-bottom:var(--sp-5)">
              <div style="font-weight:var(--fw-medium);margin-bottom:var(--sp-2)">{{ l.producto.nombreComercial }}
                <span class="cell-sub cell-mono">curva {{ l.producto.referencia.tallaMin.valor }}–{{ l.producto.referencia.tallaMax.valor }}</span></div>
              <app-talla-grid [tallas]="tallasDe(l.producto)" [valores]="l.valores" (cambio)="setValores(l.producto.id, $event)" />
            </div>
          }
        }

        <!-- PASO 3: REVISAR -->
        @if (paso() === 3) {
          <div class="panel-title">Revisar</div>
          <div class="kv"><span class="k">Cliente</span><span class="v">{{ clienteSel()?.nombre }}</span></div>
          @for (l of lineas(); track l.producto.id) {
            <div style="margin-top:var(--sp-3)"><b>{{ l.producto.nombreComercial }}</b> — {{ totalLinea(l) }} pares</div>
          }
          <div style="margin-top:var(--sp-3);font-weight:var(--fw-semibold)">Total general: {{ totalGeneral() }} pares</div>
          @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }
        }
      </div></div>

      <!-- FOOT -->
      <div class="wizard-foot" style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--sp-5)">
        <button class="btn btn-ghost" type="button" [style.visibility]="paso() === 0 ? 'hidden' : 'visible'" (click)="atras()">Atrás</button>
        <div class="cell-sub">Paso {{ paso() + 1 }} de 4</div>
        @if (paso() < 3) {
          <button class="btn btn-primary" type="button" [disabled]="!pasoValido()" (click)="siguiente()">Continuar</button>
        } @else {
          <button class="btn btn-primary" type="button" [class.is-loading]="enviando()" [disabled]="enviando() || !pasoValido()" (click)="crear()">Crear OC</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .wz-steps{display:flex;gap:var(--sp-4)}
    .wz-step{display:flex;align-items:center;gap:var(--sp-2);color:var(--text-subtle);font-size:var(--text-sm)}
    .wz-step.is-active{color:var(--text);font-weight:var(--fw-medium)}
    .wz-step.is-done{color:var(--primary)}
    .wz-marker{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;border:var(--bw) solid var(--border);font-size:var(--text-caption);font-family:var(--font-mono)}
    .wz-step.is-active .wz-marker{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
    .wz-step.is-done .wz-marker{background:var(--primary-subtle);color:var(--primary);border-color:var(--primary)}
    .panel-title{font-size:var(--text-h3);font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .kv{display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3);padding:var(--sp-2) 0}
  `],
})
export class OcCrearComponent implements OnInit {
  private readonly clientesApi = inject(ClientesApi);
  private readonly pedidosApi = inject(PedidosApi);
  private readonly catalogoApi = inject(CatalogoApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  pasosLabels = ['Cliente', 'Productos', 'Curva de tallas', 'Revisar'];

  clientes = signal<Cliente[]>([]);
  productos = signal<ProductoConfiguradoFull[]>([]);
  tallas = signal<Talla[]>([]);

  clienteSel = signal<Cliente | null>(null);
  ocCliente = signal('');
  observaciones = signal('');
  lineas = signal<LineaWizard[]>([]);
  paso = signal<0 | 1 | 2 | 3>(0);
  enviando = signal(false);
  error = signal('');

  nombreCliente = (c: Cliente) => c.nombre;
  nitCliente = (c: Cliente) => c.nit;
  nombreProducto = (p: ProductoConfiguradoFull) => p.nombreComercial;
  codigoProducto = (p: ProductoConfiguradoFull) => p.codigo;

  productosDisponibles = computed(() => {
    const usados = new Set(this.lineas().map((l) => l.producto.id));
    return this.productos().filter((p) => !usados.has(p.id));
  });

  totalGeneral = computed(() => this.lineas().reduce((acc, l) => acc + totalCurva(l.valores), 0));

  ngOnInit(): void {
    this.clientesApi.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => this.clientes.set(c));
    this.catalogoApi.listarProductos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => this.productos.set(p));
    this.catalogoApi.listarTallas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((t) => this.tallas.set(t));
  }

  tallasDe(p: ProductoConfiguradoFull): Talla[] { return tallasDeProducto(p, this.tallas()); }
  totalLinea(l: LineaWizard): number { return totalCurva(l.valores); }

  agregarProducto(p: ProductoConfiguradoFull) {
    if (this.lineas().some((l) => l.producto.id === p.id)) return;
    this.lineas.update((ls) => [...ls, { producto: p, valores: {} }]);
  }
  quitarProducto(id: number) { this.lineas.update((ls) => ls.filter((l) => l.producto.id !== id)); }
  setValores(productoId: number, valores: Record<number, number>) {
    this.lineas.update((ls) => ls.map((l) => (l.producto.id === productoId ? { ...l, valores } : l)));
  }

  pasoValido(): boolean {
    switch (this.paso()) {
      case 0: return this.clienteSel() !== null;
      case 1: return this.lineas().length >= 1;
      case 2: return this.lineas().every((l) => totalCurva(l.valores) > 0);
      default: return this.lineas().length >= 1 && this.clienteSel() !== null;
    }
  }

  siguiente() { if (this.pasoValido() && this.paso() < 3) this.paso.update((p) => (p + 1) as 0 | 1 | 2 | 3); }
  atras() { if (this.paso() > 0) this.paso.update((p) => (p - 1) as 0 | 1 | 2 | 3); }

  crear() {
    const cl = this.clienteSel();
    if (!cl || this.enviando() || !this.pasoValido()) return;
    this.enviando.set(true); this.error.set('');
    const dto = construirDto({ clienteId: cl.id, ocCliente: this.ocCliente(), observaciones: this.observaciones(), lineas: this.lineas() });
    this.pedidosApi.crearOC(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.enviando.set(false); this.router.navigateByUrl('/pedidos/oc'); },
      error: (e) => { this.enviando.set(false); this.error.set(this.msg(e)); },
    });
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo crear la OC');
  }
}
