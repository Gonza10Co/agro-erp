import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardApi } from '../../core/api/dashboard.api';
import { DashboardResumen } from '../../core/api/models/dashboard.models';

const CELULAS: { key: string; label: string }[] = [
  { key: 'CORTE', label: 'Corte' },
  { key: 'GUARNICION', label: 'Guarnición' },
  { key: 'ALMACEN', label: 'Almacén' },
  { key: 'INYECCION', label: 'Inyección' },
  { key: 'PT', label: 'P. Terminado' },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Panel gerencial</div></div>

      @if (r(); as d) {
        <!-- KPIs principales -->
        <div class="kpis">
          <a class="kpi" routerLink="/pedidos/oc">
            <span class="kpi-l">Pedidos en curso</span>
            <span class="kpi-v">{{ d.pedidos.enCurso }}</span>
            <span class="kpi-s">{{ d.pedidos.porEstado.EN_PRODUCCION }} en producción</span>
          </a>
          <a class="kpi" routerLink="/despachos">
            <span class="kpi-l">Despachos del mes</span>
            <span class="kpi-v">{{ d.despachosMes }}</span>
            <span class="kpi-s">mes en curso</span>
          </a>
          <a class="kpi" routerLink="/facturas">
            <span class="kpi-l">Facturación del mes</span>
            <span class="kpi-v">{{ moneda(d.facturacionMes.total) }}</span>
            <span class="kpi-s">{{ d.facturacionMes.count }} factura(s)</span>
          </a>
          <a class="kpi" [class.is-alert]="d.cartera.saldoVencido > 0" routerLink="/cartera">
            <span class="kpi-l">Por cobrar</span>
            <span class="kpi-v">{{ moneda(d.cartera.saldoTotal) }}</span>
            <span class="kpi-s">{{ moneda(d.cartera.saldoVencido) }} vencido · {{ d.cartera.clientesVencidos }} cliente(s)</span>
          </a>
        </div>

        <div class="grid2">
          <!-- Producción en planta -->
          <div class="card"><div class="card-body">
            <div class="sec-h">Producción en planta <span class="cell-sub">· {{ d.produccion.ofActivas }} OF activas · {{ d.produccion.paresEnProceso }} pares en proceso</span></div>
            @if (d.produccion.paresEnProceso === 0) {
              <p class="cell-sub">No hay pares en proceso ahora mismo.</p>
            } @else {
              @for (c of celulas(); track c.key) {
                <div class="bar-row">
                  <span class="bar-l">{{ c.label }}</span>
                  <div class="bar-track"><div class="bar-fill" [style.width.%]="pct(c.pares)"></div></div>
                  <span class="bar-v">{{ c.pares }}</span>
                </div>
              }
            }
            <a class="link-more" routerLink="/fabricacion/tablero">Ver tablero →</a>
          </div></div>

          <!-- Pedidos por estado -->
          <div class="card"><div class="card-body">
            <div class="sec-h">Pedidos por estado</div>
            <div class="estado-grid">
              <div class="estado"><span class="estado-v">{{ d.pedidos.porEstado.BORRADOR }}</span><span class="estado-l">Borrador</span></div>
              <div class="estado"><span class="estado-v">{{ d.pedidos.porEstado.CONFIRMADA }}</span><span class="estado-l">Confirmada</span></div>
              <div class="estado"><span class="estado-v">{{ d.pedidos.porEstado.EN_PRODUCCION }}</span><span class="estado-l">En producción</span></div>
              <div class="estado"><span class="estado-v">{{ d.pedidos.porEstado.CERRADA }}</span><span class="estado-l">Cerrada</span></div>
            </div>
            <a class="link-more" routerLink="/pedidos/oc">Ver órdenes →</a>
          </div></div>
        </div>
      } @else {
        <div class="card"><div class="card-body">Cargando indicadores…</div></div>
      }
    </div>
  `,
  styles: [`
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-4);margin-bottom:var(--sp-4)}
    .kpi{display:flex;flex-direction:column;gap:var(--sp-1);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-md);padding:var(--sp-4);text-decoration:none;color:var(--text);transition:border-color .15s}
    .kpi:hover{border-color:var(--primary)}
    .kpi.is-alert{border-color:var(--error)}
    .kpi-l{font-size:var(--text-caption);color:var(--text-subtle);text-transform:uppercase;letter-spacing:.04em}
    .kpi-v{font-size:var(--text-h2);font-weight:var(--fw-semibold);font-family:var(--font-mono)}
    .kpi.is-alert .kpi-v{color:var(--error)}
    .kpi-s{font-size:var(--text-caption);color:var(--text-muted)}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)}
    .sec-h{font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .bar-row{display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-2)}
    .bar-l{width:96px;font-size:var(--text-sm);color:var(--text-muted)}
    .bar-track{flex:1;height:10px;background:var(--surface-2,var(--border));border-radius:99px;overflow:hidden}
    .bar-fill{height:100%;background:var(--primary);border-radius:99px;min-width:2px}
    .bar-v{width:32px;text-align:right;font-family:var(--font-mono);font-size:var(--text-sm)}
    .estado-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-3)}
    .estado{background:var(--surface-2,transparent);border:var(--bw) solid var(--border);border-radius:var(--r-sm);padding:var(--sp-3);text-align:center}
    .estado-v{display:block;font-size:var(--text-h3);font-weight:var(--fw-semibold);font-family:var(--font-mono)}
    .estado-l{display:block;font-size:var(--text-caption);color:var(--text-subtle);margin-top:var(--sp-1)}
    .link-more{display:inline-block;margin-top:var(--sp-4);font-size:var(--text-sm);color:var(--primary);text-decoration:none}
    @media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
  `],
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(DashboardApi);
  private readonly destroyRef = inject(DestroyRef);
  r = signal<DashboardResumen | null>(null);
  cargando = signal(true);

  celulas = computed(() => {
    const d = this.r();
    const mapa = new Map((d?.produccion.porCelula ?? []).map((c) => [c.celula, c.pares]));
    return CELULAS.map((c) => ({ ...c, pares: mapa.get(c.key) ?? 0 }));
  });
  private maxCelula = computed(() => Math.max(1, ...this.celulas().map((c) => c.pares)));

  ngOnInit(): void {
    this.api.resumen().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => { this.r.set(d); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  pct(pares: number): number { return Math.round((pares / this.maxCelula()) * 100); }
  moneda(n: number): string { return '$' + Math.round(n).toLocaleString('es-CO'); }
}
