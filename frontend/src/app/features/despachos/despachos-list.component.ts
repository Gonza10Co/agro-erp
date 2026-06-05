import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DespachosApi } from '../../core/api/despachos.api';
import { DespachoListItem } from '../../core/api/models/pedidos.models';

@Component({
  selector: 'app-despachos-list',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Despachos</div></div>
      <div class="card"><div class="card-body">
        @if (despachos().length) {
          <table class="tbl">
            <thead><tr><th>Despacho</th><th>OP</th><th>Cliente</th><th>Fecha</th><th>Autorizado</th></tr></thead>
            <tbody>
              @for (d of despachos(); track d.id) {
                <tr>
                  <td class="mono">DSP-{{ d.consecutivo }}</td>
                  <td class="mono">OP-{{ d.op.consecutivo }}</td>
                  <td>{{ d.op.oc.cliente.nombre }}</td>
                  <td>{{ d.fecha | date:'dd MMM y' }}</td>
                  <td>@if (d.autorizadoPorId) { <span class="badge badge-accent">autorizado</span> } @else { <span class="cell-sub">—</span> }</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="empty"><h4>Sin despachos todavía</h4><p class="cell-sub">Los despachos aparecerán acá cuando se despache una OP.</p></div>
        }
      </div></div>
    </div>
  `,
  styles: [`
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding:0 0 var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .tbl td{padding:var(--sp-3) var(--sp-3) var(--sp-3) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .mono{font-family:var(--font-mono)}
  `],
})
export class DespachosListComponent implements OnInit {
  private readonly api = inject(DespachosApi);
  private readonly destroyRef = inject(DestroyRef);
  despachos = signal<DespachoListItem[]>([]);

  ngOnInit(): void {
    this.api.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((d) => this.despachos.set(d));
  }
}
