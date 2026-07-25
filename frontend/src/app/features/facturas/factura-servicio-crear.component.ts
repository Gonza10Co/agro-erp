import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FacturasApi } from '../../core/api/facturas.api';
import { ClientesApi } from '../../core/api/clientes.api';
import { LineasApi, Linea } from '../../core/api/lineas.api';
import { ServicioCatalogo } from '../../core/api/models/servicios.models';
import { Cliente } from '../../core/api/models/pedidos.models';

interface LineaForm {
  servicioId: number | null;
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number | null;
}

/**
 * Factura de SERVICIO: maquila (la inyección que se le presta a la capellada de
 * un tercero) o mantenimiento. No sale de un despacho porque no hay producto
 * propio que salga de bodega — es una línea de ingreso aparte que igual entra
 * a cartera y suma en el reporte de su línea de producción.
 */
@Component({
  selector: 'app-factura-servicio-crear',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
  template: `
    <div class="page">
      <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
        <a routerLink="/facturas">Facturas</a><span class="sep">/</span>
        <span class="current">Nueva factura de servicio</span>
      </nav>

      <div class="page-header">
        <div>
          <div class="ph-title">Factura de servicio</div>
          <div class="cell-sub">Maquila o mantenimiento: se cobra el trabajo, no botas propias.</div>
        </div>
      </div>

      <div class="card"><div class="card-body">
        <div class="grid-2">
          <div>
            <label class="label">Cliente</label>
            <select class="input" [ngModel]="clienteId()" (ngModelChange)="clienteId.set($event)">
              <option [ngValue]="null">— Elegir cliente —</option>
              @for (c of clientes(); track c.id) {
                <option [ngValue]="c.id">{{ c.nombre }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Línea de producción (opcional)</label>
            <select class="input" [ngModel]="lineaId()" (ngModelChange)="cambiarLinea($event)">
              <option [ngValue]="null">— Sin línea (ingreso global) —</option>
              @for (l of lineas(); track l.id) {
                <option [ngValue]="l.id">{{ l.nombre }}</option>
              }
            </select>
          </div>
        </div>

        @if (sugerencia(); as s) {
          <p class="sugerencia">
            <b>{{ s.linea.nombre }}</b> terminó <b>{{ s.paresTerminados | number }}</b> pares
            en {{ nombreMes() }}.
            @if (s.paresTerminados > 0) {
              <button class="btn-link" type="button" (click)="usarSugerencia()">Usar esa cantidad</button>
            }
          </p>
        }

        <div class="lineas-head">
          <span>Servicio</span><span>Detalle</span><span class="num">Cantidad</span><span class="num">$ unitario</span><span></span>
        </div>
        @for (l of lineasForm(); track $index; let i = $index) {
          <div class="linea-form">
            <select class="input" [ngModel]="l.servicioId" (ngModelChange)="elegirServicio(i, $event)">
              <option [ngValue]="null">— Libre —</option>
              @for (s of servicios(); track s.id) {
                <option [ngValue]="s.id">{{ s.nombre }}</option>
              }
            </select>
            <input class="input" type="text" placeholder="descripción que va en la factura"
              [ngModel]="l.descripcion" (ngModelChange)="setLinea(i, 'descripcion', $event)" />
            <input class="input num" type="number" min="1" placeholder="0"
              [ngModel]="l.cantidad" (ngModelChange)="setLinea(i, 'cantidad', $event)" />
            <input class="input num" type="number" min="0" step="any" placeholder="0"
              [ngModel]="l.precioUnitario" (ngModelChange)="setLinea(i, 'precioUnitario', $event)" />
            <button class="btn btn-ghost btn-x" type="button" title="Quitar línea"
              [disabled]="lineasForm().length === 1" (click)="quitarLinea(i)">✕</button>
          </div>
        }
        <button class="btn btn-ghost" type="button" (click)="agregarLinea()">+ Agregar línea</button>

        <div class="totales">
          <span>Subtotal <b>{{ moneda(subtotal()) }}</b></span>
          <span>IVA 19% <b>{{ moneda(iva()) }}</b></span>
          <span class="total">Total <b>{{ moneda(total()) }}</b></span>
        </div>

        @if (error()) { <p class="err">{{ error() }}</p> }

        <div style="margin-top:var(--sp-5)">
          <button class="btn btn-primary" type="button" [class.is-loading]="enviando()"
            [disabled]="enviando() || !valido()" (click)="emitir()">Emitir factura</button>
        </div>
      </div></div>
    </div>
  `,
  styles: [`
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .input.num{text-align:right;font-family:var(--font-mono)}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)}
    .sugerencia{margin-top:var(--sp-4);font-size:var(--text-sm);color:var(--text-muted);background:color-mix(in srgb, var(--accent) 7%, transparent);border-radius:var(--r-sm);padding:var(--sp-3)}
    .btn-link{background:none;border:none;color:var(--accent);cursor:pointer;font:inherit;text-decoration:underline;padding:0 var(--sp-2)}
    .lineas-head{display:grid;grid-template-columns:1fr 1.4fr 110px 140px 36px;gap:var(--sp-2);margin-top:var(--sp-4);font-size:var(--text-caption);color:var(--text-subtle)}
    .lineas-head .num{text-align:right}
    .linea-form{display:grid;grid-template-columns:1fr 1.4fr 110px 140px 36px;gap:var(--sp-2);margin:var(--sp-2) 0;align-items:center}
    .btn-x{padding:var(--sp-1) var(--sp-2)}
    .totales{display:flex;gap:var(--sp-5);justify-content:flex-end;margin-top:var(--sp-4);font-size:var(--text-sm);color:var(--text-muted);font-family:var(--font-mono)}
    .totales .total{color:var(--text);font-size:var(--text-base)}
    .err{color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)}
    @media (max-width:900px){.grid-2{grid-template-columns:1fr}}
  `],
})
export class FacturaServicioCrearComponent implements OnInit {
  private readonly api = inject(FacturasApi);
  private readonly clientesApi = inject(ClientesApi);
  private readonly lineasApi = inject(LineasApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly hoy = new Date();
  clientes = signal<Cliente[]>([]);
  lineas = signal<Linea[]>([]);
  servicios = signal<ServicioCatalogo[]>([]);
  clienteId = signal<number | null>(null);
  lineaId = signal<number | null>(null);
  sugerencia = signal<{ linea: { nombre: string }; paresTerminados: number } | null>(null);
  lineasForm = signal<LineaForm[]>([this.lineaVacia()]);
  enviando = signal(false);
  error = signal('');

  private lineaVacia(): LineaForm {
    return { servicioId: null, descripcion: '', cantidad: null, precioUnitario: null };
  }

  private lineasValidas = computed(() =>
    this.lineasForm().filter(
      (l) => (l.servicioId != null || l.descripcion.trim()) && l.cantidad && l.precioUnitario != null,
    ),
  );

  subtotal = computed(() =>
    this.lineasValidas().reduce((s, l) => s + Number(l.cantidad) * Number(l.precioUnitario), 0),
  );
  iva = computed(() => Math.round(this.subtotal() * 0.19));
  total = computed(() => this.subtotal() + this.iva());

  valido = computed(() => this.clienteId() != null && this.lineasValidas().length > 0);

  ngOnInit(): void {
    this.clientesApi.listar().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cs) => this.clientes.set(cs.filter((c) => c.activo)));
    this.lineasApi.listar().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ls) => this.lineas.set(ls.filter((l) => l.activo)));
    this.api.catalogoServicios().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ss) => this.servicios.set(ss));
  }

  /** Al elegir línea se pregunta cuántos pares terminó: la cantidad no se inventa. */
  cambiarLinea(id: number | null): void {
    this.lineaId.set(id);
    this.sugerencia.set(null);
    if (id == null) return;
    this.api
      .sugerenciaServicio(id, this.hoy.getUTCFullYear(), this.hoy.getUTCMonth() + 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.sugerencia.set(s),
        error: () => this.sugerencia.set(null),
      });
  }

  usarSugerencia(): void {
    const pares = this.sugerencia()?.paresTerminados;
    if (!pares) return;
    this.setLinea(0, 'cantidad', pares);
  }

  elegirServicio(i: number, servicioId: number | null): void {
    const s = this.servicios().find((x) => x.id === servicioId);
    this.lineasForm.update((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? {
              ...l,
              servicioId,
              // El precio base del catálogo es un default editable, no una atadura.
              precioUnitario: l.precioUnitario ?? s?.precioBase ?? null,
              descripcion: l.descripcion || (s?.nombre ?? ''),
            }
          : l,
      ),
    );
  }

  setLinea(i: number, campo: keyof LineaForm, valor: any): void {
    this.lineasForm.update((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor === '' ? (campo === 'descripcion' ? '' : null) : valor } : l)),
    );
  }
  agregarLinea(): void { this.lineasForm.update((ls) => [...ls, this.lineaVacia()]); }
  quitarLinea(i: number): void { this.lineasForm.update((ls) => ls.filter((_, idx) => idx !== i)); }

  emitir(): void {
    if (this.enviando() || !this.valido()) return;
    this.enviando.set(true);
    this.error.set('');
    this.api
      .facturarServicio({
        clienteId: this.clienteId()!,
        lineaId: this.lineaId() ?? undefined,
        lineas: this.lineasValidas().map((l) => ({
          servicioId: l.servicioId ?? undefined,
          descripcion: l.descripcion.trim() || undefined,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
        })),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (f: any) => this.router.navigate(['/facturas', f.id]),
        error: (e) => {
          this.enviando.set(false);
          const m = e?.error?.message;
          this.error.set(Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo emitir la factura'));
        },
      });
  }

  moneda(n: number): string { return '$' + Math.round(n ?? 0).toLocaleString('es-CO'); }
  nombreMes(): string {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${meses[this.hoy.getUTCMonth()]} ${this.hoy.getUTCFullYear()}`;
  }
}
