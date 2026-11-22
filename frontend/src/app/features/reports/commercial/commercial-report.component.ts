import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartData, ChartOptions } from 'chart.js';
import { ReportesApi } from '../../../core/api/reportes.api';
import {
  CommercialDimension, CommercialMeasure, CommercialReport, FilterOption, OrderStatus, RankItem,
} from '../../../core/api/models/commercial-report.models';
import { ChartComponent } from '../../../shared/chart/chart.component';
import { descargarXlsx } from '../../../shared/xlsx/xlsx-mini';
import {
  DIMENSION_LABEL, MEASURE_LABEL, defaultRange, exportFileName, monthLabel, pivotSheets, pivotTable,
} from './commercial-pivot.util';

type FilterKey = 'clientIds' | 'brandIds' | 'referenceIds' | 'lineIds';

const STATUS_LABEL: Record<OrderStatus, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  EN_PRODUCCION: 'En producción',
  CERRADA: 'Cerrada',
  ANULADA: 'Anulada',
};
// Ventas en firme: borradores y anuladas solo si se marcan a mano.
const DEFAULT_STATUSES: OrderStatus[] = ['CONFIRMADA', 'EN_PRODUCCION', 'CERRADA'];

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Reporte comercial (reunión del 2026-11-21, para Alejandra y gerencia): pedidos por
 * cliente y por mes. KPIs arriba, gráfico por mes, top de clientes o referencias y una
 * tabla dinámica en la que se elige qué va en las filas y qué medida se mira. Todo se
 * agrega en el backend (`GET /reports/commercial`); acá solo se proyecta y se exporta.
 */
@Component({
  selector: 'app-commercial-report',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ChartComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="ph-title">Reporte comercial</div>
          <div class="ph-sub">Pedidos por cliente y por mes, según la fecha en que el cliente puso el pedido (o la de carga si no la tiene)</div>
        </div>
        <div class="acciones">
          <button class="btn" type="button" (click)="load()" [disabled]="loading()">Actualizar</button>
          <button class="btn btn-primary" type="button" (click)="export()" [disabled]="!report()?.pivot?.rows?.length">Descargar Excel</button>
        </div>
      </div>

      <div class="card filtros-card">
        <div class="filtros">
          <label class="field"><span class="label">Desde</span>
            <input class="input" type="date" [ngModel]="from()" (ngModelChange)="from.set($event); load()" /></label>
          <label class="field"><span class="label">Hasta</span>
            <input class="input" type="date" [ngModel]="to()" (ngModelChange)="to.set($event); load()" /></label>
          @for (f of filterDefs; track f.key) {
            <label class="field"><span class="label">{{ f.label }}</span>
              <div class="select-wrap">
                <select class="select" [attr.aria-label]="'Filtrar por ' + f.label" (change)="onPick(f.key, $event)">
                  <option value="">{{ selected()[f.key].length ? 'Agregar otro…' : 'Todos' }}</option>
                  @for (o of available(f.key); track o.id) { <option [value]="o.id">{{ o.label }}</option> }
                </select>
              </div></label>
          }
        </div>
        <div class="estados">
          <span class="label">Estado</span>
          @for (s of statusList; track s) {
            <button type="button" class="chip" [class.on]="statuses().includes(s)" (click)="toggleStatus(s)">{{ statusLabel[s] }}</button>
          }
          <button type="button" class="chip" [class.on]="includeStock()" (click)="toggleStock()" title="Los pedidos de mínimos de stock no son ventas: por defecto no suman">Incluir mínimos de stock</button>
          @for (c of activeChips(); track c.key + c.id) {
            <button type="button" class="chip on filtro" (click)="removeFilter(c.key, c.id)" [title]="'Quitar ' + c.label">{{ c.label }} ×</button>
          }
          @if (activeChips().length) { <button type="button" class="btn btn-ghost btn-sm" (click)="clearFilters()">Limpiar filtros</button> }
        </div>
      </div>

      @if (error()) {
        <div class="card"><div class="card-body"><div class="empty"><h4>No se pudo cargar el reporte</h4><p class="cell-sub">{{ error() }}</p></div></div></div>
      } @else if (loading() && !report()) {
        <div class="card"><div class="card-body">Armando el reporte…</div></div>
      } @else {
      @if (report(); as r) {
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Pedidos</div><div class="kpi-value">{{ r.kpis.orders | number }}</div>
            <div class="kpi-delta t-muted">de {{ r.kpis.clients | number }} {{ r.kpis.clients === 1 ? 'cliente' : 'clientes' }}</div></div>
          <div class="kpi"><div class="kpi-label">Pares pedidos</div><div class="kpi-value">{{ r.kpis.pairs | number }}</div>
            <div class="kpi-delta t-muted">{{ r.kpis.pending | number }} por despachar</div></div>
          <div class="kpi"><div class="kpi-label">Pares despachados</div><div class="kpi-value">{{ r.kpis.dispatched | number }}</div>
            <div class="kpi-delta t-muted">{{ pct(r.kpis.dispatched, r.kpis.pairs) }} % de lo pedido</div></div>
          <div class="kpi"><div class="kpi-label">Valor pedido</div><div class="kpi-value">{{ short(r.kpis.value) }}</div>
            <div class="kpi-delta t-muted">
              @if (r.kpis.unpricedPairs) { {{ r.kpis.unpricedPairs | number }} pares sin precio no suman } @else { {{ cop(r.kpis.value) }} }
            </div></div>
        </div>

        <div class="charts">
          <div class="card">
            <div class="card-head"><h3 class="t-h3">{{ monthChartTitle() }}</h3></div>
            <div class="card-body"><app-chart [type]="monthChart().type" [data]="monthChart().data" [options]="monthChart().options" height="260px" ariaLabel="Pedidos por mes" /></div>
          </div>
          <div class="card">
            <div class="card-head">
              <h3 class="t-h3">Top {{ topBy() === 'client' ? 'clientes' : 'referencias' }}</h3>
              <div class="seg">
                <button type="button" [class.on]="topBy() === 'client'" (click)="topBy.set('client')">Clientes</button>
                <button type="button" [class.on]="topBy() === 'reference'" (click)="topBy.set('reference')">Referencias</button>
              </div>
            </div>
            <div class="card-body">
              @if (donut().labels?.length) {
                <app-chart type="doughnut" [data]="donut()" [options]="donutOptions" height="260px" ariaLabel="Top por pares pedidos" />
              } @else { <div class="empty"><p>Sin pedidos en el rango.</p></div> }
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <div class="table-toolbar">
            <div class="pivot-ctl">
              <span class="label">Filas</span>
              <div class="seg">
                @for (d of dimensions; track d) { <button type="button" [class.on]="rows() === d" (click)="setRows(d)">{{ dimensionLabel[d] }}</button> }
              </div>
              <span class="label">Medida</span>
              <div class="seg">
                @for (m of measures; track m) { <button type="button" [class.on]="measure() === m" (click)="measure.set(m)">{{ measureLabel[m] }}</button> }
              </div>
            </div>
            <input class="input buscar" type="search" placeholder="Buscar en las filas…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
          </div>
          @if (table(); as t) {
            @if (!t.rows.length) {
              <div class="card-body"><div class="empty"><h4>No hay pedidos con estos filtros</h4><p>Prueba otro rango de fechas o quita algún filtro.</p></div></div>
            } @else {
              <div class="table-scroll">
                <table class="table pivot">
                  <thead><tr>
                    <th class="sticky">{{ dimensionLabel[t.dimension] }}</th>
                    @for (m of t.months; track m) { <th class="num">{{ month(m) }}</th> }
                    <th class="num">Total</th><th class="num">%</th>
                  </tr></thead>
                  <tbody>
                    @for (row of t.rows; track row.key) {
                      <tr>
                        <td class="sticky">{{ row.label }}</td>
                        @for (v of row.values; track $index) { <td class="num" [class.cero]="!v">{{ fmt(v) }}</td> }
                        <td class="num fuerte">{{ fmt(row.total) }}</td>
                        <td class="num t-muted">{{ row.share | number: '1.1-1' }}</td>
                      </tr>
                    }
                  </tbody>
                  <tfoot><tr>
                    <td class="sticky">Total</td>
                    @for (v of t.totals; track $index) { <td class="num">{{ fmt(v) }}</td> }
                    <td class="num">{{ fmt(t.grandTotal) }}</td><td class="num">100</td>
                  </tr></tfoot>
                </table>
              </div>
              @if (t.measure === 'orders') {
                <div class="table-foot">Un pedido con varias {{ dimensionLabel[t.dimension].toLowerCase() }}s cuenta en cada fila, pero una sola vez en el total.</div>
              }
            }
          }
        </div>
      }
      }
    </div>
  `,
  styles: [`
    .acciones { display: flex; gap: var(--sp-2); }
    .filtros-card { padding: var(--sp-4); margin-bottom: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); }
    .filtros { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-3); }
    .estados { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
    .chip { height: 28px; padding: 0 12px; border-radius: var(--r-full); border: var(--bw) solid var(--border-strong); background: var(--surface); color: var(--text-muted); font-size: var(--text-caption); cursor: pointer; }
    .chip.on { background: var(--primary-subtle); border-color: var(--primary-border); color: var(--primary); font-weight: var(--fw-semibold); }
    .chip.filtro { background: var(--accent-subtle); border-color: color-mix(in oklch, var(--accent) 45%, transparent); color: var(--text); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-5); }
    .charts { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--sp-4); margin-bottom: var(--sp-5); }
    @media (max-width: 900px) { .charts { grid-template-columns: minmax(0, 1fr); } }
    .seg { display: inline-flex; border: var(--bw) solid var(--border-strong); border-radius: var(--r-sm); overflow: hidden; }
    .seg button { border: 0; background: var(--surface); color: var(--text-muted); font-size: var(--text-caption); padding: 5px 10px; cursor: pointer; }
    .seg button + button { border-left: var(--bw) solid var(--border); }
    .seg button.on { background: var(--primary); color: var(--primary-fg); }
    .pivot-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
    .buscar { max-width: 240px; }
    .pivot { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
    .pivot th, .pivot td { padding: 8px 12px; border-bottom: var(--bw) solid var(--border); white-space: nowrap; }
    .pivot th { background: var(--surface-sunken); color: var(--text-muted); font-size: var(--text-caption); font-weight: var(--fw-semibold); text-align: left; }
    .pivot .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pivot .sticky { position: sticky; left: 0; background: var(--surface); max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
    .pivot th.sticky { background: var(--surface-sunken); }
    .pivot .cero { color: var(--text-subtle); }
    .pivot .fuerte, .pivot tfoot td { font-weight: var(--fw-semibold); }
    .pivot tfoot td { background: var(--surface-sunken); border-top: var(--bw-2) solid var(--border-strong); }
    .pivot tbody tr:hover td { background: var(--surface-hover); }
  `],
})
export class CommercialReportComponent implements OnInit {
  private readonly api = inject(ReportesApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly dimensions: CommercialDimension[] = ['client', 'brand', 'reference', 'line'];
  readonly measures: CommercialMeasure[] = ['pairs', 'dispatched', 'value', 'orders'];
  readonly dimensionLabel = DIMENSION_LABEL;
  readonly measureLabel = MEASURE_LABEL;
  readonly statusLabel = STATUS_LABEL;
  readonly statusList: OrderStatus[] = ['BORRADOR', 'CONFIRMADA', 'EN_PRODUCCION', 'CERRADA', 'ANULADA'];
  readonly filterDefs: { key: FilterKey; label: string }[] = [
    { key: 'clientIds', label: 'Cliente' },
    { key: 'brandIds', label: 'Marca' },
    { key: 'referenceIds', label: 'Referencia' },
    { key: 'lineIds', label: 'Línea' },
  ];

  readonly from = signal(defaultRange().from);
  readonly to = signal(defaultRange().to);
  readonly rows = signal<CommercialDimension>('client');
  readonly measure = signal<CommercialMeasure>('pairs');
  readonly statuses = signal<OrderStatus[]>([...DEFAULT_STATUSES]);
  readonly selected = signal<Record<FilterKey, number[]>>({ clientIds: [], brandIds: [], referenceIds: [], lineIds: [] });
  readonly search = signal('');
  readonly includeStock = signal(false);
  readonly topBy = signal<'client' | 'reference'>('client');

  readonly report = signal<CommercialReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private seq = 0;

  readonly table = computed(() => {
    const r = this.report();
    return r ? pivotTable(r, this.measure(), this.search()) : null;
  });

  readonly activeChips = computed(() => {
    const r = this.report();
    const sel = this.selected();
    const out: { key: FilterKey; id: number; label: string }[] = [];
    for (const f of this.filterDefs) {
      for (const id of sel[f.key]) {
        const o = this.optionsOf(r, f.key).find((x) => (x.id ?? 0) === id);
        out.push({ key: f.key, id, label: `${f.label}: ${o?.label ?? id}` });
      }
    }
    return out;
  });

  readonly monthChartTitle = computed(() => {
    const m = this.measure();
    return m === 'pairs' || m === 'dispatched' ? 'Pares pedidos y despachados por mes' : `${MEASURE_LABEL[m]} por mes`;
  });

  readonly monthChart = computed(() => {
    const r = this.report();
    const m = this.measure();
    const labels = (r?.byMonth ?? []).map((b) => monthLabel(b.month));
    if (m === 'value') {
      return {
        type: 'line' as const,
        data: { labels, datasets: [{ label: 'Valor', data: (r?.byMonth ?? []).map((b) => b.value) }] } as ChartData,
        options: { plugins: { tooltip: { callbacks: { label: (c: any) => money.format(c.raw) } } }, scales: { y: { ticks: { callback: (v: any) => compact.format(v) } } } } as ChartOptions,
      };
    }
    if (m === 'orders') {
      return {
        type: 'bar' as const,
        data: { labels, datasets: [{ label: 'Pedidos', data: (r?.byMonth ?? []).map((b) => b.orders) }] } as ChartData,
        options: {} as ChartOptions,
      };
    }
    return {
      type: 'bar' as const,
      data: {
        labels,
        datasets: [
          { label: 'Pares pedidos', data: (r?.byMonth ?? []).map((b) => b.pairs) },
          { label: 'Pares despachados', data: (r?.byMonth ?? []).map((b) => b.dispatched) },
        ],
      } as ChartData,
      options: {} as ChartOptions,
    };
  });

  readonly donut = computed<ChartData>(() => {
    const r = this.report();
    if (!r) return { labels: [], datasets: [] };
    const items: RankItem[] = this.topBy() === 'client' ? r.topClients : r.topReferences;
    const shown = items.filter((i) => i.pairs > 0);
    const rest = r.kpis.pairs - shown.reduce((s, i) => s + i.pairs, 0);
    const labels = shown.map((i) => i.label);
    const data = shown.map((i) => i.pairs);
    if (rest > 0) { labels.push('Otros'); data.push(rest); }
    return { labels, datasets: [{ label: 'Pares pedidos', data }] };
  });

  readonly donutOptions: ChartOptions = {
    plugins: {
      legend: { position: 'right' },
      tooltip: { callbacks: { label: (c: any) => ` ${new Intl.NumberFormat('es-CO').format(c.raw)} pares` } },
    },
  } as ChartOptions;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.from() || !this.to()) return;
    const id = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    const sel = this.selected();
    this.api
      .commercial({ from: this.from(), to: this.to(), rows: this.rows(), statuses: this.statuses(), includeStock: this.includeStock(), ...sel })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => { if (id === this.seq) { this.report.set(r); this.loading.set(false); } },
        error: (e) => {
          if (id !== this.seq) return;
          this.loading.set(false);
          this.error.set(e?.error?.message ?? 'Error de conexión con el servidor');
        },
      });
  }

  setRows(d: CommercialDimension): void {
    if (this.rows() === d) return;
    this.rows.set(d);
    this.search.set('');
    this.load();
  }

  toggleStatus(s: OrderStatus): void {
    const cur = this.statuses();
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    // Sin ninguno el backend vuelve al defecto; mejor no dejar la lista vacía.
    this.statuses.set(next.length ? next : [...DEFAULT_STATUSES]);
    this.load();
  }

  toggleStock(): void {
    this.includeStock.update((v) => !v);
    this.load();
  }

  available(key: FilterKey): FilterOption[] {
    const sel = this.selected()[key];
    return this.optionsOf(this.report(), key).filter((o) => !sel.includes(o.id ?? 0));
  }

  onPick(key: FilterKey, ev: Event): void {
    const el = ev.target as HTMLSelectElement;
    const value = el.value;
    el.value = ''; // el select vuelve a "Todos / Agregar otro…": lo elegido queda como chip
    this.addFilter(key, value);
  }

  addFilter(key: FilterKey, value: string): void {
    if (value === '' || value == null) return;
    const id = Number(value);
    const cur = this.selected();
    if (cur[key].includes(id)) return;
    this.selected.set({ ...cur, [key]: [...cur[key], id] });
    this.load();
  }

  removeFilter(key: FilterKey, id: number): void {
    const cur = this.selected();
    this.selected.set({ ...cur, [key]: cur[key].filter((x) => x !== id) });
    this.load();
  }

  clearFilters(): void {
    this.selected.set({ clientIds: [], brandIds: [], referenceIds: [], lineIds: [] });
    this.load();
  }

  export(): void {
    const r = this.report();
    if (!r) return;
    descargarXlsx(exportFileName(r.rows), pivotSheets(r, this.measure()));
  }

  fmt(v: number): string {
    return this.measure() === 'value' ? money.format(v) : new Intl.NumberFormat('es-CO').format(v);
  }

  cop(v: number): string { return money.format(v); }
  short(v: number): string { return `$ ${compact.format(v)}`; }
  month(m: string): string { return monthLabel(m); }
  pct(a: number, b: number): string { return b ? (Math.round((a / b) * 1000) / 10).toLocaleString('es-CO') : '0'; }

  private optionsOf(r: CommercialReport | null, key: FilterKey): FilterOption[] {
    if (!r) return [];
    const map: Record<FilterKey, FilterOption[]> = {
      clientIds: r.options.clients, brandIds: r.options.brands, referenceIds: r.options.references, lineIds: r.options.lines,
    };
    return map[key];
  }
}
