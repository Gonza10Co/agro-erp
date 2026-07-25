import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReportesApi } from '../../core/api/reportes.api';
import { LineasApi, Linea } from '../../core/api/lineas.api';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import {
  ETIQUETA_META,
  MetaItem,
  ReporteDiario,
  TIPOS_META,
  TipoMeta,
} from '../../core/api/models/reporte-diario.models';

@Component({
  selector: 'app-reporte-diario',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Reporte diario gerencial</div>
        <div class="ph-actions">
          <select class="mes-input" [ngModel]="lineaSel()" (ngModelChange)="cambiarLinea($event)">
            <option [ngValue]="null">Todas las líneas</option>
            @for (l of lineasProd(); track l.id) {
              <option [ngValue]="l.id">{{ l.nombre }}</option>
            }
          </select>
          <input class="mes-input" type="month" [value]="mesValor()" (change)="cambiarMes($event)" />
          <button class="btn" type="button" (click)="abrirMetas()">Editar metas</button>
        </div>
      </div>

      @if (r(); as d) {
        <!-- Metas: cumplimiento del mes -->
        <div class="metas">
          @for (m of metasCards(); track m.key) {
            <div class="meta-card">
              <div class="meta-h">{{ m.label }}</div>
              <div class="meta-pct" [class.ok]="m.pct >= 100" [class.warn]="m.pct < 100">{{ m.pct }}%</div>
              <div class="meta-bar"><div class="meta-fill" [class.ok]="m.pct >= 100" [style.width.%]="cap(m.pct)"></div></div>
              <div class="meta-s">{{ m.fmt(m.real) }} / {{ m.fmt(m.meta) }}</div>
            </div>
          }
        </div>

        <!-- Nota honesta sobre columnas no capturadas aún -->
        @if (d.pendientes.length) {
          <p class="nota">
            <b>Nota:</b> la columna <em>Externo</em> aún no se captura en el sistema
            (va en 0). Pendiente de definir con el cliente · {{ d.pendientes.join(' · ') }}.
          </p>
        }

        <!-- Tabla diaria estilo Excel -->
        <div class="card"><div class="card-body table-wrap">
          <div class="sec-h">Producción y ventas por día · {{ nombreMes() }}</div>
          <table class="tbl">
            <thead>
              <tr>
                <th class="l">Día</th>
                <th>Troquelado</th>
                <th>Almacén</th>
                <th class="pend" title="Pendiente de captura">Externo</th>
                <th>Inyección</th>
                <th>Bodega</th>
                <th class="seg" title="Pares que salieron de segunda (no entran al saldo de primeras)">Segundas</th>
                <th>Pares vendidos</th>
                <th>Valor</th>
                <th class="serv" title="Maquila y mantenimiento: línea de ingreso aparte de la venta de botas">Servicios</th>
              </tr>
            </thead>
            <tbody>
              @for (f of d.filas; track f.fecha) {
                <tr [class.vacia]="sinActividad(f)">
                  <td class="l">{{ dia(f.fecha) }}</td>
                  <td>{{ num(f.troquelado) }}</td>
                  <td>{{ num(f.almacen) }}</td>
                  <td class="pend">{{ num(f.externo) }}</td>
                  <td>{{ num(f.inyeccion) }}</td>
                  <td>{{ num(f.bodega) }}</td>
                  <td class="seg" [class.cero]="!f.segundas">{{ num(f.segundas) }}</td>
                  <td>{{ num(f.paresVendidos) }}</td>
                  <td>{{ f.valor ? moneda(f.valor) : '—' }}</td>
                  <td class="serv">{{ f.servicios ? moneda(f.servicios) : '—' }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="acum">
                <td class="l">ACUMULADO</td>
                <td>{{ num(d.acumulado.troquelado) }}</td>
                <td>{{ num(d.acumulado.almacen) }}</td>
                <td class="pend">{{ num(d.acumulado.externo) }}</td>
                <td>{{ num(d.acumulado.inyeccion) }}</td>
                <td>{{ num(d.acumulado.bodega) }}</td>
                <td class="seg">{{ num(d.acumulado.segundas) }}</td>
                <td>{{ num(d.acumulado.paresVendidos) }}</td>
                <td>{{ moneda(d.acumulado.valor) }}</td>
                <td class="serv">{{ moneda(d.acumulado.servicios) }}</td>
              </tr>
            </tfoot>
          </table>
        </div></div>

        <!-- Kardex de Producto Terminado -->
        <div class="card"><div class="card-body table-wrap">
          <div class="sec-h">Kardex de Producto Terminado <span class="cell-sub">· saldo de bodega día a día</span></div>
          @if (lineaSel() !== null && kardexConMov().length === 0) {
            <!-- Los movimientos previos al kardex por línea no tienen línea sellada. -->
            <p class="cell-sub">Sin movimientos de bodega de esta línea este mes (los históricos sin línea suman solo en «Todas las líneas»).</p>
          } @else if (kardexConMov().length === 0) {
            <p class="cell-sub">Sin movimientos de bodega este mes.</p>
          } @else {
            <table class="tbl">
              <thead>
                <tr><th class="l">Día</th><th>Saldo inicial</th><th>Ingreso</th><th>Venta</th><th>Devolución</th><th>Saldo final</th></tr>
              </thead>
              <tbody>
                @for (k of kardexConMov(); track k.fecha) {
                  <tr>
                    <td class="l">{{ dia(k.fecha) }}</td>
                    <td>{{ num(k.saldoInicial) }}</td>
                    <td class="pos">{{ k.ingreso ? '+' + num(k.ingreso) : '—' }}</td>
                    <td class="neg">{{ k.venta ? '−' + num(k.venta) : '—' }}</td>
                    <td class="pos">{{ k.devolucion ? '+' + num(k.devolucion) : '—' }}</td>
                    <td><b>{{ num(k.saldoFinal) }}</b></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div></div>
      } @else {
        <div class="card"><div class="card-body">Cargando reporte…</div></div>
      }
    </div>

    <!-- Drawer: editar metas del mes (globales o de la línea filtrada) -->
    <app-drawer [open]="drawer()" [title]="'Metas de ' + nombreMes() + ' · ' + nombreLinea()" (closed)="drawer.set(false)">
      <div class="form">
        @for (t of tiposMeta; track t) {
          <label class="fld">
            <span>{{ etiqueta[t] }} <em class="uni">{{ esValor(t) ? '($)' : '(pares)' }}</em></span>
            <input type="number" min="0" [ngModel]="form[t]" (ngModelChange)="form[t] = $event" [name]="t" />
          </label>
        }
        <div class="form-actions">
          <button class="btn ghost" type="button" (click)="drawer.set(false)">Cancelar</button>
          <button class="btn" type="button" [disabled]="guardando()" (click)="guardar()">{{ guardando() ? 'Guardando…' : 'Guardar metas' }}</button>
        </div>
      </div>
    </app-drawer>
  `,
  styles: [`
    .ph-actions{display:flex;gap:var(--sp-3);align-items:center}
    .mes-input{font:inherit;padding:6px 10px;border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .btn{font:inherit;font-weight:var(--fw-semibold);padding:8px 14px;border-radius:var(--r-sm);border:var(--bw) solid var(--primary);background:var(--primary);color:#fff;cursor:pointer}
    .btn.ghost{background:transparent;color:var(--text);border-color:var(--border)}
    .btn:disabled{opacity:.6;cursor:default}
    /* 7 tarjetas (5 células + 2 de facturación): que fluyan según el ancho. */
    .metas{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--sp-4);margin-bottom:var(--sp-4)}
    .meta-card{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-md);padding:var(--sp-4)}
    .meta-h{font-size:var(--text-caption);color:var(--text-subtle);text-transform:uppercase;letter-spacing:.04em}
    .meta-pct{font-size:var(--text-h2);font-weight:var(--fw-semibold);font-family:var(--font-mono);margin:var(--sp-1) 0}
    .meta-pct.ok{color:var(--ok,#16a34a)} .meta-pct.warn{color:var(--warn,#d97706)}
    .meta-bar{height:8px;background:var(--surface-2,var(--border));border-radius:99px;overflow:hidden}
    .meta-fill{height:100%;background:var(--warn,#d97706);border-radius:99px;min-width:2px}
    .meta-fill.ok{background:var(--ok,#16a34a)}
    .meta-s{font-size:var(--text-caption);color:var(--text-muted);margin-top:var(--sp-2);font-family:var(--font-mono)}
    .nota{font-size:var(--text-sm);color:var(--text-muted);background:var(--surface-2,transparent);border:var(--bw) dashed var(--border);border-radius:var(--r-sm);padding:var(--sp-3);margin-bottom:var(--sp-4)}
    .sec-h{font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .table-wrap{overflow-x:auto}
    .tbl{width:100%;border-collapse:collapse;font-size:var(--text-sm);font-family:var(--font-mono)}
    .tbl th,.tbl td{padding:6px 10px;text-align:right;border-bottom:var(--bw) solid var(--border);white-space:nowrap}
    .tbl th.l,.tbl td.l{text-align:left;font-family:var(--font-sans,inherit)}
    .tbl thead th{font-size:var(--text-caption);color:var(--text-subtle);text-transform:uppercase;letter-spacing:.03em;font-weight:var(--fw-semibold)}
    .tbl th.pend,.tbl td.pend{color:var(--text-subtle);font-style:italic}
    /* Segundas: producto vendible pero de menor grado — se marca, no se esconde. */
    .tbl td.seg{color:var(--warn,#d97706);font-weight:var(--fw-semibold)}
    .tbl td.seg.cero{color:var(--text-subtle);font-weight:400}
    /* Servicios: ingreso que no viene de vender botas (maquila Feroz). */
    .tbl td.serv{color:var(--accent)}
    .tbl tr.vacia td{color:var(--text-subtle);opacity:.55}
    .tbl tfoot .acum td{background:var(--warn-bg,#fef9c3);color:#000;font-weight:var(--fw-semibold);border-top:2px solid var(--border)}
    .tbl td.pos{color:var(--ok,#16a34a)} .tbl td.neg{color:var(--warn,#d97706)}
    .cell-sub{font-size:var(--text-sm);color:var(--text-muted);font-weight:var(--fw-regular)}
    .form{display:flex;flex-direction:column;gap:var(--sp-4)}
    .fld{display:flex;flex-direction:column;gap:var(--sp-1)}
    .fld span{font-size:var(--text-sm);color:var(--text-muted)}
    .fld .uni{font-style:normal;color:var(--text-subtle);font-size:var(--text-caption)}
    .fld input{font:inherit;padding:8px 10px;border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .form-actions{display:flex;justify-content:flex-end;gap:var(--sp-3);margin-top:var(--sp-2)}
    @media (max-width:640px){.metas{grid-template-columns:repeat(2,1fr)}}
  `],
})
export class ReporteDiarioComponent implements OnInit {
  private readonly api = inject(ReportesApi);
  private readonly lineasApi = inject(LineasApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly hoy = new Date();
  anio = signal(this.hoy.getUTCFullYear());
  mes = signal(this.hoy.getUTCMonth() + 1);
  r = signal<ReporteDiario | null>(null);
  // null = toda la fábrica; con id, el reporte (y sus metas) son de esa línea.
  lineasProd = signal<Linea[]>([]);
  lineaSel = signal<number | null>(null);
  drawer = signal(false);
  guardando = signal(false);

  // Modelo del formulario de metas: un valor por tipo, para no tener un campo suelto
  // por cada célula (hoy 7 tipos; el día que entre uno nuevo, el drawer no se toca).
  readonly tiposMeta = TIPOS_META;
  readonly etiqueta = ETIQUETA_META;
  form: Record<TipoMeta, number> = this.formVacio();

  private formVacio(): Record<TipoMeta, number> {
    return Object.fromEntries(TIPOS_META.map((t) => [t, 0])) as Record<TipoMeta, number>;
  }

  /** Unidad de cada meta, para el sufijo del campo y el formato de la tarjeta. */
  esValor(tipo: TipoMeta): boolean { return tipo === 'FACTURACION_VALOR'; }

  mesValor = computed(() => `${this.anio()}-${String(this.mes()).padStart(2, '0')}`);
  kardexConMov = computed(() => (this.r()?.kardexPT ?? []).filter((k) => k.ingreso || k.venta || k.devolucion));

  // Una tarjeta por célula (en orden de flujo) más las dos de facturación: es el
  // tablero del dueño, que mira cumplimiento centro de costo por centro de costo.
  metasCards = computed(() => {
    const m = this.r()?.metas;
    if (!m) return [];
    const pares = (n: number) => this.num(n);
    return [
      ...m.celulas.map((c) => ({
        key: c.celula,
        label: ETIQUETA_META[c.celula],
        meta: c.meta,
        real: c.real,
        pct: c.pct,
        fmt: pares,
      })),
      { key: 'FACTURACION_PARES', label: ETIQUETA_META.FACTURACION_PARES, ...m.facturacionPares, fmt: pares },
      { key: 'FACTURACION_VALOR', label: ETIQUETA_META.FACTURACION_VALOR, ...m.facturacionValor, fmt: (n: number) => this.moneda(n) },
    ];
  });

  ngOnInit(): void {
    this.lineasApi.listar().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ls) => this.lineasProd.set(ls.filter((l) => l.activo)));
    this.cargar();
  }

  private cargar(): void {
    this.api
      .diario(this.anio(), this.mes(), this.lineaSel() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((d) => this.r.set(d));
  }

  cambiarLinea(id: number | null): void {
    this.lineaSel.set(id);
    this.r.set(null);
    this.cargar();
  }

  nombreLinea(): string {
    return this.lineasProd().find((l) => l.id === this.lineaSel())?.nombre ?? 'toda la fábrica';
  }

  cambiarMes(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value; // 'YYYY-MM'
    if (!v) return;
    const [a, m] = v.split('-').map(Number);
    this.anio.set(a);
    this.mes.set(m);
    this.r.set(null);
    this.cargar();
  }

  abrirMetas(): void {
    const m = this.r()?.metas;
    const form = this.formVacio();
    for (const c of m?.celulas ?? []) form[c.celula] = c.meta;
    form.FACTURACION_PARES = m?.facturacionPares.meta ?? 0;
    form.FACTURACION_VALOR = m?.facturacionValor.meta ?? 0;
    this.form = form;
    this.drawer.set(true);
  }

  guardar(): void {
    const items: MetaItem[] = TIPOS_META.map((tipo) => ({ tipo, valor: Number(this.form[tipo]) }));
    this.guardando.set(true);
    this.api
      .guardarMetas(this.anio(), this.mes(), items, this.lineaSel() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.drawer.set(false);
          this.cargar();
        },
        error: () => this.guardando.set(false),
      });
  }

  sinActividad(f: { troquelado: number; inyeccion: number; bodega: number; paresVendidos: number }): boolean {
    return !f.troquelado && !f.inyeccion && !f.bodega && !f.paresVendidos;
  }
  cap(pct: number): number { return Math.min(100, pct); }
  dia(fecha: string): string { return fecha.slice(8); }
  num(n: number): string { return (n ?? 0).toLocaleString('es-CO'); }
  moneda(n: number): string { return '$' + Math.round(n ?? 0).toLocaleString('es-CO'); }
  nombreMes(): string {
    const meses = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${meses[this.mes()]} ${this.anio()}`;
  }
}
