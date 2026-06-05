import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { Requerimiento } from '../../core/api/models/compras.models';

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

        <div class="page-header"><div class="ph-title">Requerimiento de compra REQ-{{ r.consecutivo }}</div>
          <div class="cell-sub">Calculado {{ r.fecha | date:'dd MMM y' }}</div>
        </div>

        @if (r.grupos.length) {
          @for (g of r.grupos; track g.proveedor?.id ?? -1) {
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
  `],
})
export class RequerimientoComponent implements OnInit {
  private readonly api = inject(ComprasApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  req = signal<Requerimiento | null>(null);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const id = Number(p.get('id'));
      this.api.obtener(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((r) => this.req.set(r));
    });
  }
}
