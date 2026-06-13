import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DespachosApi } from '../../core/api/despachos.api';
import { FacturasApi } from '../../core/api/facturas.api';
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
            <thead><tr><th>Despacho</th><th>OP</th><th>Cliente</th><th>Fecha</th><th>Autorizado</th><th>Factura</th></tr></thead>
            <tbody>
              @for (d of despachos(); track d.id) {
                <tr>
                  <td class="mono">DSP-{{ d.consecutivo }}</td>
                  <td class="mono">OP-{{ d.op.consecutivo }}</td>
                  <td>{{ d.op.oc.cliente.nombre }}</td>
                  <td>{{ d.fecha | date:'dd MMM y' }}</td>
                  <td>@if (d.autorizadoPorId) { <span class="badge badge-accent">autorizado</span> } @else { <span class="cell-sub">—</span> }</td>
                  <td>
                    @if (d.factura) {
                      <button class="btn btn-ghost btn-sm" type="button" (click)="verFactura()">FAC-{{ d.factura.consecutivo }}</button>
                    } @else {
                      <button class="btn btn-primary btn-sm" type="button" [class.is-loading]="facturando() === d.id" [disabled]="facturando() !== null" (click)="facturar(d)">Facturar</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="empty"><h4>Sin despachos todavía</h4><p class="cell-sub">Los despachos aparecerán acá cuando se despache una OP.</p></div>
        }
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }
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
  private readonly facturasApi = inject(FacturasApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  despachos = signal<DespachoListItem[]>([]);
  facturando = signal<number | null>(null);
  error = signal('');

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.api.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((d) => this.despachos.set(d));
  }

  facturar(d: DespachoListItem): void {
    if (this.facturando() !== null) return;
    this.facturando.set(d.id); this.error.set('');
    this.facturasApi.facturar({ despachoId: d.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.facturando.set(null); this.router.navigateByUrl('/facturas'); },
        error: (e) => { this.facturando.set(null); this.error.set(this.msg(e)); },
      });
  }

  verFactura(): void { this.router.navigateByUrl('/facturas'); }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo facturar');
  }
}
