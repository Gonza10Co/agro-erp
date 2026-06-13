import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CarteraApi } from '../../core/api/cartera.api';
import { CarteraItem } from '../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { RegistrarPagoComponent } from './registrar-pago.component';

@Component({
  selector: 'app-cartera-list',
  standalone: true,
  imports: [DatePipe, DrawerComponent, RegistrarPagoComponent],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Cartera · Cuentas por cobrar</div></div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando cartera…</div></div>
      } @else if (items().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h18v10H3zM3 11h18M7 15h4"/></svg></span>
            <h4>Sin cuentas por cobrar</h4>
            <p>Cuando se emitan facturas con saldo pendiente, aparecerán acá.</p>
          </div>
        </div></div>
      } @else {
        <div class="resumen">
          <div class="stat"><span class="stat-l">Saldo total</span><span class="stat-v">{{ moneda(saldoTotal()) }}</span></div>
          <div class="stat is-venc"><span class="stat-l">Saldo vencido</span><span class="stat-v">{{ moneda(saldoVencido()) }}</span></div>
          <div class="stat"><span class="stat-l">Facturas pendientes</span><span class="stat-v">{{ items().length }}</span></div>
        </div>
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Factura</th><th>Cliente</th><th>Vence</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (i of items(); track i.facturaId) {
                  <tr [class.fila-vencida]="i.vencida">
                    <td class="cell-mono">FAC-{{ i.consecutivo }}</td>
                    <td>{{ i.cliente.nombre }}</td>
                    <td class="cell-sub">{{ i.fechaVencimiento ? (i.fechaVencimiento | date:'dd/MM/yyyy') : '—' }}</td>
                    <td class="num cell-mono">{{ moneda(i.total) }}</td>
                    <td class="num cell-mono cell-sub">{{ moneda(i.pagado) }}</td>
                    <td class="num cell-mono">{{ moneda(i.saldo) }}</td>
                    <td>
                      @if (i.vencida) { <span class="badge badge-error"><span class="dot"></span>Vencida</span> }
                      @else { <span class="badge badge-neutral"><span class="dot"></span>Al día</span> }
                    </td>
                    <td><button class="btn btn-primary btn-sm" type="button" (click)="abrir(i)">Registrar pago</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="!!seleccionada()" [title]="tituloDrawer()" (closed)="cerrar()">
      @if (seleccionada(); as f) {
        <app-registrar-pago [factura]="f" (paid)="onPagado()" />
      }
    </app-drawer>
  `,
  styles: [`
    .resumen{display:flex;gap:var(--sp-4);margin-bottom:var(--sp-4)}
    .stat{flex:1;background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-md);padding:var(--sp-3) var(--sp-4)}
    .stat.is-venc{border-color:var(--error)}
    .stat-l{display:block;font-size:var(--text-caption);color:var(--text-subtle)}
    .stat-v{display:block;font-size:var(--text-h3);font-weight:var(--fw-semibold);font-family:var(--font-mono);margin-top:var(--sp-1)}
    .stat.is-venc .stat-v{color:var(--error)}
    .fila-vencida{background:color-mix(in srgb, var(--error) 7%, transparent)}
  `],
})
export class CarteraListComponent implements OnInit {
  private readonly api = inject(CarteraApi);
  private readonly destroyRef = inject(DestroyRef);
  items = signal<CarteraItem[]>([]);
  cargando = signal(true);
  seleccionada = signal<CarteraItem | null>(null);
  tituloDrawer = computed(() => {
    const s = this.seleccionada();
    return s ? `Pago · FAC-${s.consecutivo}` : '';
  });

  saldoTotal = computed(() => this.items().reduce((acc, i) => acc + i.saldo, 0));
  saldoVencido = computed(() => this.items().filter((i) => i.vencida).reduce((acc, i) => acc + i.saldo, 0));

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (xs) => { this.items.set(xs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(i: CarteraItem): void { this.seleccionada.set(i); }
  cerrar(): void { this.seleccionada.set(null); }
  onPagado(): void { this.cerrar(); this.cargar(); }
  moneda(n: number): string { return '$' + Math.round(n).toLocaleString('es-CO'); }
}
