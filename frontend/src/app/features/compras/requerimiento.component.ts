import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { Requerimiento, ResultadoGenerarOrdenes } from '../../core/api/models/compras.models';

@Component({
  selector: 'app-requerimiento',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page page-wide">
      @if (req(); as r) {
        <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
          <a routerLink="/pedidos/op">Órdenes de Producción</a><span class="sep">/</span>
          <a [routerLink]="['/pedidos/op', r.opId]">OP-{{ r.opId }}</a><span class="sep">/</span>
          <span class="current">Requerimiento REQ-{{ r.consecutivo }}</span>
        </nav>

        <div class="page-header">
          <div>
            <div class="ph-title">Requerimiento de compra REQ-{{ r.consecutivo }}</div>
            <div class="cell-sub">Calculado {{ r.fecha | date:'dd MMM y' }}</div>
          </div>
          @if (puedeGenerar()) {
            <button class="btn btn-primary" type="button" [class.is-loading]="generando()"
              [disabled]="generando()" (click)="generar()">Generar órdenes de compra</button>
          } @else if (r.estado === 'CON_ORDEN') {
            <a class="btn btn-ghost" routerLink="/compras/ordenes">Ver órdenes generadas</a>
          }
        </div>

        @if (resultado(); as res) {
          <div class="banner-ok">
            <strong>{{ res.ordenes.length }} orden(es) de compra generada(s):</strong>
            @for (o of res.ordenes; track o.id) {
              <a class="cell-mono" [routerLink]="['/compras/ordenes', o.id]">OCP-{{ o.consecutivo }} ({{ o.proveedor.nombre }})</a>
            }
            @if (res.sinProveedor.length) {
              <p class="warn">⚠ Sin proveedor asignado (no generan orden):
                @for (m of res.sinProveedor; track m.materialId) { <span class="cell-mono">{{ m.codigo }}</span> }
                — asignalos en el catálogo de materiales.
              </p>
            }
          </div>
        }
        @if (errorGenerar()) {
          <div class="banner-err">{{ errorGenerar() }}</div>
        }

        @if (r.grupos.length) {
          @for (g of r.grupos; track $index) {
            <div class="card" style="margin-bottom:var(--sp-4)">
              <div class="card-head" style="padding:var(--sp-4) var(--sp-5);border-bottom:var(--bw) solid var(--border)">
                <h3 style="font-size:var(--text-h3);font-weight:var(--fw-semibold)">
                  {{ g.proveedor?.nombre ?? 'Sin proveedor' }}
                </h3>
              </div>
              <div class="card-body">
                <table class="tbl">
                  <thead><tr><th>Insumo</th><th class="num">Necesita</th><th class="num">Stock</th><th class="num">A comprar</th></tr></thead>
                  <tbody>
                    @for (l of g.lineas; track l.materialId) {
                      <tr>
                        <td><span class="mono">{{ l.materialCodigo }}</span> · {{ l.materialNombre }}</td>
                        <td class="num">{{ l.cantNecesaria | number:'1.0-2' }}</td>
                        <td class="num">{{ l.cantDisponible | number:'1.0-2' }}</td>
                        <td class="num comprar" [class.cero]="l.cantAComprar === 0">{{ l.cantAComprar | number:'1.0-2' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        } @else {
          <div class="card"><div class="card-body"><div class="empty">
            <h4>Nada que comprar</h4>
            <p class="cell-sub">La OP está completamente cubierta por inventario.</p>
          </div></div></div>
        }
      } @else if (estado() === 'error') {
        <div class="card"><div class="card-body"><div class="empty">
          <h4>No se encontró el requerimiento</h4>
          <p class="cell-sub">No pudimos cargar este requerimiento de compra.</p>
        </div></div></div>
      } @else {
        <div class="card"><div class="card-body">Cargando requerimiento…</div></div>
      }
    </div>
  `,
  styles: [`
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding:0 var(--sp-3) var(--sp-2) 0;border-bottom:var(--bw) solid var(--border)}
    .tbl td{padding:var(--sp-3) var(--sp-3) var(--sp-3) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .tbl th.num,.tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
    .mono{font-family:var(--font-mono)}
    .comprar{font-weight:var(--fw-semibold);color:var(--accent)}
    .comprar.cero{color:var(--text-subtle);font-weight:400}
    .banner-ok{background:color-mix(in srgb, var(--success, #2e9e5b) 8%, transparent);border:var(--bw) solid var(--success, #2e9e5b);border-radius:var(--r-md);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-4);display:flex;gap:var(--sp-3);align-items:baseline;flex-wrap:wrap}
    .banner-ok a{color:var(--accent)}
    .banner-err{background:color-mix(in srgb, var(--error) 8%, transparent);border:var(--bw) solid var(--error);border-radius:var(--r-md);padding:var(--sp-3) var(--sp-4);margin-bottom:var(--sp-4);color:var(--error)}
    .warn{width:100%;font-size:var(--text-sm);color:var(--text-muted)}
  `],
})
export class RequerimientoComponent implements OnInit {
  private readonly api = inject(ComprasApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  req = signal<Requerimiento | null>(null);
  estado = signal<'cargando' | 'ok' | 'error'>('cargando');
  generando = signal(false);
  resultado = signal<ResultadoGenerarOrdenes | null>(null);
  errorGenerar = signal('');

  // Hay algo que ordenar si existe al menos una línea a comprar con proveedor.
  puedeGenerar = computed(() => {
    const r = this.req();
    if (!r || r.estado === 'CON_ORDEN') return false;
    return r.grupos.some((g) => g.proveedor && g.lineas.some((l) => l.cantAComprar > 0));
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const id = Number(p.get('id'));
      this.estado.set('cargando');
      this.api.obtener(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (r) => { this.req.set(r); this.estado.set('ok'); },
        error: () => this.estado.set('error'),
      });
    });
  }

  generar(): void {
    const r = this.req();
    if (!r || this.generando()) return;
    this.generando.set(true);
    this.errorGenerar.set('');
    this.api.generarOrdenes(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.generando.set(false);
        this.resultado.set(res);
        this.req.set({ ...r, estado: 'CON_ORDEN' });
      },
      error: (e) => {
        this.generando.set(false);
        const m = e?.error?.message;
        this.errorGenerar.set(Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudieron generar las órdenes'));
      },
    });
  }
}
