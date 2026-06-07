import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { OFListItem } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-of-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Órdenes de Fabricación</div></div>
      <div class="card"><div class="card-body">
        @if (error()) {
          <div class="empty"><h4>No se pudo cargar las órdenes de fabricación</h4><p class="cell-sub">{{ error() }}</p></div>
        } @else if (ofs().length) {
          <table class="tbl">
            <thead><tr><th>OF</th><th>OP</th><th>Pares</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              @for (o of ofs(); track o.id) {
                <tr>
                  <td class="mono">OF-{{ o.consecutivo }}</td>
                  <td class="mono">OP-{{ o.op.consecutivo }}</td>
                  <td>{{ o._count.pares }}</td>
                  <td><span class="badge">{{ o.estado }}</span></td>
                  <td>{{ o.fecha | date:'dd MMM y' }}</td>
                  <td><a class="btn btn-sm" [routerLink]="['/fabricacion/tablero']" [queryParams]="{ ofId: o.id }">Ver tablero</a></td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="empty"><h4>Sin OF todavía</h4><p class="cell-sub">Generá una OF desde el detalle de una OP con producción pendiente.</p></div>
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
export class OfListComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  ofs = signal<OFListItem[]>([]);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.listarOF().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => this.ofs.set(o),
      error: () => this.error.set('No se pudo cargar las órdenes de fabricación. Intentá de nuevo.'),
    });
  }
}
