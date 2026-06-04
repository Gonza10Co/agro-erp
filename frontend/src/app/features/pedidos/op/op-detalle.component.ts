import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { badgeOP } from '../oc/estado-badge';
import { resumenAmarre } from './amarre-view';

@Component({
  selector: 'app-op-detalle',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page page-wide">
      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando orden de producción…</div></div>
      } @else if (op()) {
        @if (op(); as o) {
        <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
          <a routerLink="/pedidos/oc">Órdenes de Compra</a><span class="sep">/</span>
          <span class="current">OP-{{ o.consecutivo }}</span>
        </nav>

        <!-- HERO -->
        <div class="op-hero">
          <div class="op-id">
            <span class="seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <div>
              <h1>OP-{{ o.consecutivo }}</h1>
              <div class="meta">
                <span class="badge {{ badge(o).clase }}"><span class="dot"></span>{{ badge(o).label }}</span>
                <span>·</span><span>OC <a routerLink="/pedidos/oc">OC-{{ o.oc?.consecutivo }}</a></span>
                <span>·</span><span>{{ o.oc?.cliente?.nombre }}</span>
                <span>·</span><span>Generada {{ o.fecha | date:'dd MMM' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- SUMMARY -->
        <div class="summary">
          <div class="sum"><div class="sl"><i style="background:var(--text-subtle)"></i>Pedido total</div><div class="sv">{{ resumen().pedido | number:'1.0-0' }}</div><div class="sd">pares</div></div>
          <div class="sum hl-stock"><div class="sl"><i style="background:var(--success)"></i>Amarrado en stock</div><div class="sv" style="color:var(--success)">{{ resumen().stock | number:'1.0-0' }}</div><div class="sd">{{ resumen().pctStock }}% del pedido</div></div>
          <div class="sum hl-prod"><div class="sl"><i style="background:var(--accent)"></i>A producir</div><div class="sv" style="color:var(--accent)">{{ resumen().producir | number:'1.0-0' }}</div><div class="sd">{{ 100 - resumen().pctStock }}% del pedido</div></div>
          <div class="sum"><div class="sl"><i style="background:var(--primary)"></i>Bodegas</div><div class="sv">{{ resumen().bodegas.length }}</div><div class="sd">{{ nombresBodegas() }}</div></div>
        </div>

        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin:var(--sp-3) 0">{{ error() }}</p> }
        }
      } @else {
        <div class="card"><div class="card-body"><div class="empty"><h4>No se encontró la orden de producción</h4></div></div></div>
      }
    </div>
  `,
  styles: [`
    .op-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-5);flex-wrap:wrap;margin-bottom:var(--sp-5)}
    .op-id{display:flex;align-items:center;gap:14px}
    .op-id .seal{width:50px;height:50px;border-radius:var(--r-md);background:var(--primary-subtle);color:var(--primary);display:grid;place-items:center;flex:none}
    .op-id .seal svg{width:26px;height:26px}
    .op-id h1{font-size:var(--text-h1);font-weight:var(--fw-bold);letter-spacing:var(--ls-h1);line-height:1}
    .op-id .meta{display:flex;gap:10px;align-items:center;margin-top:7px;font-size:var(--text-caption);color:var(--text-muted);flex-wrap:wrap}
    .op-id .meta a{color:var(--primary);font-weight:var(--fw-medium)}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-4);margin-bottom:var(--sp-5)}
    .sum{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);padding:var(--sp-4) var(--sp-5);position:relative;overflow:hidden}
    .sum.hl-stock{border-color:color-mix(in oklch,var(--success) 35%,var(--border))}
    .sum.hl-prod{border-color:color-mix(in oklch,var(--accent) 40%,var(--border))}
    .sum .sl{font-size:var(--text-caption);color:var(--text-muted);font-weight:var(--fw-medium);display:flex;align-items:center;gap:7px}
    .sum .sl i{width:9px;height:9px;border-radius:3px}
    .sum .sv{font-family:var(--font-mono);font-size:28px;font-weight:var(--fw-semibold);letter-spacing:-0.02em;margin-top:8px}
    .sum .sd{font-size:var(--text-micro);color:var(--text-subtle);margin-top:3px}
    @media(max-width:1100px){.summary{grid-template-columns:repeat(2,1fr)}}
  `],
})
export class OpDetalleComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  op = signal<OrdenProduccion | null>(null);
  cargando = signal(true);
  accion = signal(false);
  error = signal('');

  resumen = computed(() => {
    const o = this.op();
    return o ? resumenAmarre(o) : { pedido: 0, stock: 0, producir: 0, pctStock: 0, bodegas: [] };
  });
  nombresBodegas = computed(() => this.resumen().bodegas.map(b => b.nombre).join(' · ') || '—');

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      const id = Number(p.get('id'));
      this.cargar(id);
    });
  }

  cargar(id: number): void {
    this.cargando.set(true);
    this.op.set(null);
    this.api.obtenerOP(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: o => { this.op.set(o); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  badge(o: OrdenProduccion) { return badgeOP(o.estado); }

  protected msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
