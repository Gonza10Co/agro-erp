import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReportesApi } from '../../core/api/reportes.api';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { BloqueMetas, MetaItem, ReporteDiario } from '../../core/api/models/reporte-diario.models';

@Component({
  selector: 'app-reporte-diario',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Reporte diario gerencial</div>
        <div class="ph-actions">
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
        <p class="nota">
          <b>Nota:</b> las columnas <em>Externo</em> y <em>Segundas</em> aún no se capturan en el sistema
          (van en 0). Pendiente de definir con el cliente · {{ d.pendientes.join(' · ') }}.
        </p>

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
                <th class="pend" title="Pendiente de captura">Segundas</th>
                <th>Pares vendidos</th>
                <th>Valor</th>
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
                  <td class="pend">{{ num(f.segundas) }}</td>
                  <td>{{ num(f.paresVendidos) }}</td>
                  <td>{{ f.valor ? moneda(f.valor) : '—' }}</td>
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
                <td class="pend">{{ num(d.acumulado.segundas) }}</td>
                <td>{{ num(d.acumulado.paresVendidos) }}</td>
                <td>{{ moneda(d.acumulado.valor) }}</td>
              </tr>
            </tfoot>
          </table>
        </div></div>

        <!-- Kardex de Producto Terminado -->
        <div class="card"><div class="card-body table-wrap">
          <div class="sec-h">Kardex de Producto Terminado <span class="cell-sub">· saldo de bodega día a día</span></div>
          @if (kardexConMov().length === 0) {
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

    <!-- Drawer: editar metas del mes -->
    <app-drawer [open]="drawer()" [title]="'Metas de ' + nombreMes()" (closed)="drawer.set(false)">
      <div class="form">
        <label class="fld"><span>Meta de Guarnición (pares)</span><input type="number" min="0" [(ngModel)]="fGuarn" /></label>
        <label class="fld"><span>Meta de Inyección (pares)</span><input type="number" min="0" [(ngModel)]="fIny" /></label>
        <label class="fld"><span>Meta de facturación (pares)</span><input type="number" min="0" [(ngModel)]="fFacPares" /></label>
        <label class="fld"><span>Meta de facturación (valor $)</span><input type="number" min="0" [(ngModel)]="fFacValor" /></label>
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
    .metas{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-4);margin-bottom:var(--sp-4)}
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
    .tbl tr.vacia td{color:var(--text-subtle);opacity:.55}
    .tbl tfoot .acum td{background:var(--warn-bg,#fef9c3);color:#000;font-weight:var(--fw-semibold);border-top:2px solid var(--border)}
    .tbl td.pos{color:var(--ok,#16a34a)} .tbl td.neg{color:var(--warn,#d97706)}
    .cell-sub{font-size:var(--text-sm);color:var(--text-muted);font-weight:var(--fw-regular)}
    .form{display:flex;flex-direction:column;gap:var(--sp-4)}
    .fld{display:flex;flex-direction:column;gap:var(--sp-1)}
    .fld span{font-size:var(--text-sm);color:var(--text-muted)}
    .fld input{font:inherit;padding:8px 10px;border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .form-actions{display:flex;justify-content:flex-end;gap:var(--sp-3);margin-top:var(--sp-2)}
    @media (max-width:900px){.metas{grid-template-columns:repeat(2,1fr)}}
  `],
})
export class ReporteDiarioComponent implements OnInit {
  private readonly api = inject(ReportesApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly hoy = new Date();
  anio = signal(this.hoy.getUTCFullYear());
  mes = signal(this.hoy.getUTCMonth() + 1);
  r = signal<ReporteDiario | null>(null);
  drawer = signal(false);
  guardando = signal(false);

  // Modelo del formulario de metas (drawer).
  fGuarn = 0;
  fIny = 0;
  fFacPares = 0;
  fFacValor = 0;

  mesValor = computed(() => `${this.anio()}-${String(this.mes()).padStart(2, '0')}`);
  kardexConMov = computed(() => (this.r()?.kardexPT ?? []).filter((k) => k.ingreso || k.venta || k.devolucion));

  metasCards = computed(() => {
    const m = this.r()?.metas;
    if (!m) return [];
    const pares = (n: number) => this.num(n);
    return [
      { key: 'g', label: 'Meta Guarnición', ...m.guarnicion, fmt: pares },
      { key: 'i', label: 'Meta Inyección', ...m.inyeccion, fmt: pares },
      { key: 'fp', label: 'Facturación (pares)', ...m.facturacionPares, fmt: pares },
      { key: 'fv', label: 'Facturación (valor)', ...m.facturacionValor, fmt: (n: number) => this.moneda(n) },
    ];
  });

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.api
      .diario(this.anio(), this.mes())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((d) => this.r.set(d));
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
    this.fGuarn = m?.guarnicion.meta ?? 0;
    this.fIny = m?.inyeccion.meta ?? 0;
    this.fFacPares = m?.facturacionPares.meta ?? 0;
    this.fFacValor = m?.facturacionValor.meta ?? 0;
    this.drawer.set(true);
  }

  guardar(): void {
    const items: MetaItem[] = [
      { tipo: 'GUARNICION', valor: Number(this.fGuarn) },
      { tipo: 'INYECCION', valor: Number(this.fIny) },
      { tipo: 'FACTURACION_PARES', valor: Number(this.fFacPares) },
      { tipo: 'FACTURACION_VALOR', valor: Number(this.fFacValor) },
    ];
    this.guardando.set(true);
    this.api
      .guardarMetas(this.anio(), this.mes(), items)
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
