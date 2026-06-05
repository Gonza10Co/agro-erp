import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { DespachosApi } from '../../../core/api/despachos.api';
import { ComprasApi } from '../../../core/api/compras.api';
import { AuthService } from '../../../core/auth/auth.service';
import { badgeOP } from '../oc/estado-badge';
import { resumenAmarre, filasPorTalla, filasPorBodega } from './amarre-view';

@Component({
  selector: 'app-op-detalle',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, FormsModule],
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
          @if (o.estado === 'AMARRADA' || o.estado === 'CREADA') {
            <div class="page-actions">
              @if (despachable()) {
                <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="despachar()">Despachar</button>
              }
              @if (requerible()) {
                <button class="btn btn-secondary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="requerir()">Calcular requerimientos</button>
              }
              <button class="btn btn-secondary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="anular()">Anular OP</button>
            </div>
          }
        </div>

        @if (carteraBloqueada()) {
          <div class="card cartera-banner"><div class="card-body">
            <p style="color:var(--error);font-weight:var(--fw-medium)">⚠ {{ error() }}</p>
            @if (puedeAutorizar()) {
              <div style="display:flex;gap:var(--sp-3);align-items:center;margin-top:var(--sp-3)">
                <input class="cb-input" style="flex:1" placeholder="Motivo de la autorización" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" />
                <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion() || !motivo().trim()" (click)="despachar(true)">Autorizar y despachar</button>
              </div>
            } @else {
              <p class="cell-sub" style="margin-top:var(--sp-2)">Solo un gerente puede autorizar este despacho.</p>
            }
          </div></div>
        }

        <!-- SUMMARY -->
        <div class="summary">
          <div class="sum"><div class="sl"><i style="background:var(--text-subtle)"></i>Pedido total</div><div class="sv">{{ resumen().pedido | number:'1.0-0' }}</div><div class="sd">pares</div></div>
          <div class="sum hl-stock"><div class="sl"><i style="background:var(--success)"></i>Amarrado en stock</div><div class="sv" style="color:var(--success)">{{ resumen().stock | number:'1.0-0' }}</div><div class="sd">{{ resumen().pctStock }}% del pedido</div></div>
          <div class="sum hl-prod"><div class="sl"><i style="background:var(--accent)"></i>A producir</div><div class="sv" style="color:var(--accent)">{{ resumen().producir | number:'1.0-0' }}</div><div class="sd">{{ 100 - resumen().pctStock }}% del pedido</div></div>
          <div class="sum"><div class="sl"><i style="background:var(--primary)"></i>Bodegas</div><div class="sv">{{ resumen().bodegas.length }}</div><div class="sd">{{ nombresBodegas() }}</div></div>
        </div>

        <!-- OVERALL -->
        <div class="overall">
          <div class="ring" [style.--p]="resumen().pctStock.toString()"><b>{{ resumen().pctStock }}%</b></div>
          <div class="ov-text">
            <h3>Cumplimiento por inventario</h3>
            <p>De los {{ resumen().pedido | number:'1.0-0' }} pares pedidos, {{ resumen().stock | number:'1.0-0' }} ya están en bodega y se amarraron al pedido. Faltan {{ resumen().producir | number:'1.0-0' }} por fabricar.</p>
            <div class="ov-bar" style="margin-top:14px">
              <div class="stack-bar">
                <div class="s-stock" [style.width.%]="resumen().pctStock"></div>
                <div class="s-prod" [style.width.%]="100 - resumen().pctStock"></div>
              </div>
              <div class="stack-legend">
                <span><i style="background:var(--success)"></i>En stock (amarrado)</span>
                <span><i style="background:var(--accent)"></i>A producir</span>
                <span><i style="background:var(--inset);border:1px solid var(--border)"></i>Pedido total</span>
              </div>
            </div>
          </div>
        </div>

        <!-- AMARRE -->
        <div class="card">
          <div class="card-head" style="display:flex;align-items:center;justify-content:space-between;padding:var(--sp-4) var(--sp-5);border-bottom:var(--bw) solid var(--border)">
            <h3 style="font-size:var(--text-h3);font-weight:var(--fw-semibold)">Amarre por talla</h3>
            <div class="tabs" role="tablist">
              <button class="tab" type="button" role="tab" [attr.aria-selected]="vista() === 'talla'" (click)="vista.set('talla')">Por talla</button>
              <button class="tab" type="button" role="tab" [attr.aria-selected]="vista() === 'bodega'" (click)="vista.set('bodega')">Por bodega</button>
            </div>
          </div>
          <div class="card-body">
            @if (vista() === 'talla') {
              <div class="amarre-head"><span>Talla</span><span>Disponibilidad (stock + a producir vs. pedido)</span><span class="r">Stock / Prod / Ped</span></div>
              @for (f of porTalla(); track f.tallaId) {
                <div class="a-line">
                  <span class="a-talla">{{ f.valor }}<small>{{ f.completo ? 'completo' : 'parcial' }}</small></span>
                  <div class="a-bar" [class.full]="f.completo" [style.width.%]="f.wBar">
                    <div class="b-stock" [style.width.%]="f.wStock"></div>
                    <div class="b-prod" [style.width.%]="f.wProd"></div>
                    <div class="b-empty"></div>
                  </div>
                  <div class="a-vals"><span class="vstock">{{ f.stock | number:'1.0-0' }}</span> / <span class="vprod">{{ f.producir | number:'1.0-0' }}</span> / <span class="vped">{{ f.pedido | number:'1.0-0' }}</span></div>
                </div>
              }
              <div class="a-line a-total">
                <span class="a-talla">Σ</span>
                <div class="a-bar full">
                  <div class="b-stock" [style.width.%]="resumen().pctStock"></div>
                  <div class="b-prod" [style.width.%]="100 - resumen().pctStock"></div>
                </div>
                <div class="a-vals"><span class="vstock">{{ resumen().stock | number:'1.0-0' }}</span> / <span class="vprod">{{ resumen().producir | number:'1.0-0' }}</span> / <span class="vped">{{ resumen().pedido | number:'1.0-0' }}</span></div>
              </div>
            } @else {
              <div class="table-scroll">
                <table class="data bod-table">
                  <thead><tr><th>Talla</th><th class="num">Pedido</th>@for (b of resumen().bodegas; track b.id) {<th class="num">{{ b.nombre }}</th>}<th class="num">Total stock</th><th class="num">A producir</th></tr></thead>
                  <tbody>
                    @for (f of porBodega(); track f.tallaId) {
                      <tr>
                        <td class="cell-mono">{{ f.valor }}</td>
                        <td class="num bod-cell">{{ f.pedido | number:'1.0-0' }}</td>
                        @for (b of resumen().bodegas; track b.id) {<td class="num bod-cell" [class.bod-zero]="!f.porBodega[b.id]">{{ f.porBodega[b.id] ? (f.porBodega[b.id] | number:'1.0-0') : '—' }}</td>}
                        <td class="num bod-cell" style="color:var(--success);font-weight:600">{{ f.stock | number:'1.0-0' }}</td>
                        <td class="num bod-cell" style="color:var(--accent);font-weight:600">{{ f.producir ? (f.producir | number:'1.0-0') : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>

        @if (error() && !carteraBloqueada()) { <p style="color:var(--error);font-size:var(--text-sm);margin:var(--sp-3) 0">{{ error() }}</p> }
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
    .overall{display:flex;align-items:center;gap:var(--sp-5);padding:var(--sp-5);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);margin-bottom:var(--sp-5)}
    .overall .ring{--p:0;width:84px;height:84px;border-radius:50%;flex:none;background:conic-gradient(var(--success) calc(var(--p)*1%),var(--accent) calc(var(--p)*1%) 100%);display:grid;place-items:center;position:relative}
    .overall .ring::before{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--surface)}
    .overall .ring b{position:relative;font-family:var(--font-mono);font-size:19px;font-weight:var(--fw-bold)}
    .overall .ov-text{flex:1}
    .overall .ov-text h3{font-size:var(--text-h3);font-weight:var(--fw-semibold)}
    .overall .ov-text p{font-size:var(--text-sm);color:var(--text-muted);margin-top:3px;max-width:60ch}
    .stack-bar{height:14px;border-radius:var(--r-full);background:var(--inset);overflow:hidden;display:flex;border:var(--bw) solid var(--border)}
    .stack-bar .s-stock{background:var(--success)}
    .stack-bar .s-prod{background:var(--accent)}
    .stack-legend{display:flex;gap:18px;margin-top:11px;font-size:var(--text-caption);color:var(--text-muted);flex-wrap:wrap}
    .stack-legend span{display:inline-flex;align-items:center;gap:7px}
    .stack-legend i{width:11px;height:11px;border-radius:3px}
    .tabs{display:flex;gap:4px}
    .tab{background:none;border:0;padding:6px 12px;border-radius:var(--r-sm);font-size:var(--text-sm);color:var(--text-muted);cursor:pointer;font-weight:var(--fw-medium)}
    .tab[aria-selected="true"]{background:var(--primary-subtle);color:var(--primary)}
    .amarre-head{display:grid;grid-template-columns:54px 1fr 150px;gap:14px;padding:0 2px 10px;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-subtle);border-bottom:var(--bw) solid var(--border);margin-bottom:14px}
    .amarre-head .r{text-align:right}
    .a-line{display:grid;grid-template-columns:54px 1fr 150px;gap:14px;align-items:center;padding:7px 2px}
    .a-talla{font-family:var(--font-mono);font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--text)}
    .a-talla small{display:block;font-weight:400;color:var(--text-subtle);font-size:9px}
    .a-bar{position:relative;height:26px;border-radius:var(--r-sm);background:var(--inset);border:var(--bw) solid var(--border);overflow:hidden;display:flex}
    .a-bar .b-stock{background:var(--success);height:100%;transition:width var(--dur-slow) var(--ease)}
    .a-bar .b-prod{background:var(--accent);height:100%;transition:width var(--dur-slow) var(--ease)}
    .a-bar .b-empty{flex:1}
    .a-vals{text-align:right;font-family:var(--font-mono);font-size:var(--text-caption);font-variant-numeric:tabular-nums}
    .a-vals .vstock{color:var(--success);font-weight:var(--fw-semibold)}
    .a-vals .vprod{color:var(--accent)}
    .a-vals .vped{color:var(--text-subtle)}
    .a-total{border-top:1.5px solid var(--border-strong);margin-top:8px;padding-top:12px}
    .bod-table th.num,.bod-table td.num{text-align:right}
    .bod-cell{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
    .bod-zero{color:var(--text-subtle)}
    @media(max-width:1100px){.summary{grid-template-columns:repeat(2,1fr)}}
    .cartera-banner{border-color:color-mix(in oklch,var(--error) 40%,var(--border));margin-bottom:var(--sp-5)}
    .cb-input{padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
  `],
})
export class OpDetalleComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly despachosApi = inject(DespachosApi);
  private readonly comprasApi = inject(ComprasApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  op = signal<OrdenProduccion | null>(null);
  cargando = signal(true);
  accion = signal(false);
  error = signal('');
  carteraBloqueada = signal(false);
  motivo = signal('');

  resumen = computed(() => {
    const o = this.op();
    return o ? resumenAmarre(o) : { pedido: 0, stock: 0, producir: 0, pctStock: 0, bodegas: [] };
  });
  nombresBodegas = computed(() => this.resumen().bodegas.map(b => b.nombre).join(' · ') || '—');

  vista = signal<'talla' | 'bodega'>('talla');
  porTalla = computed(() => { const o = this.op(); return o ? filasPorTalla(o) : []; });
  porBodega = computed(() => { const o = this.op(); return o ? filasPorBodega(o) : []; });
  puedeAutorizar = computed(() => { const r = this.auth.rol(); return r === 'GERENTE' || r === 'ADMIN'; });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      const id = Number(p.get('id'));
      this.cargar(id);
    });
  }

  cargar(id: number): void {
    this.cargando.set(true);
    this.op.set(null);
    this.carteraBloqueada.set(false);
    this.motivo.set('');
    this.api.obtenerOP(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: o => { this.op.set(o); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  badge(o: OrdenProduccion) { return badgeOP(o.estado); }

  anular(): void {
    const o = this.op();
    if (!o || this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.anularOP(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.accion.set(false); this.cargar(o.id); },
      error: e => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }

  despachable = computed(() => {
    const o = this.op();
    return !!o && o.estado === 'AMARRADA' && this.resumen().producir === 0;
  });

  requerible = computed(() => {
    const o = this.op();
    return !!o && o.estado !== 'ANULADA' && this.resumen().producir > 0;
  });

  requerir(): void {
    const o = this.op();
    if (!o || this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.comprasApi.calcular(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => { this.accion.set(false); this.router.navigateByUrl('/compras/requerimiento/' + r.id); },
      error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }

  despachar(autorizar = false) {
    const o = this.op();
    if (!o || this.accion()) return;
    this.carteraBloqueada.set(false);
    this.accion.set(true); this.error.set('');
    const body = autorizar ? { opId: o.id, autorizar: true, motivo: this.motivo() } : { opId: o.id };
    this.despachosApi.despachar(body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.accion.set(false); this.router.navigateByUrl('/despachos'); },
      error: (e) => {
        this.accion.set(false);
        if (e?.status === 409) { this.carteraBloqueada.set(true); this.error.set(this.msg(e)); }
        else { this.error.set(this.msg(e)); }
      },
    });
  }

  protected msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
