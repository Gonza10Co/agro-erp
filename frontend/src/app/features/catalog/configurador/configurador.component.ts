import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { CatalogoApi } from '../../../core/api/catalogo.api';
import {
  BomResuelto, MarcaOpt, ReferenciaConfig, ReferenciaListItem, ResolverParams,
} from '../../../core/api/models/catalogo.models';
import { BuscadorSelectComponent } from '../../../shared/ui/buscador-select/buscador-select.component';
import { BomArbolComponent } from './bom-arbol/bom-arbol.component';
import { obligatoriosFaltantes, opcionIdsSel, tallasDeRef } from './configurador.util';

type ResolverResp = { ok: true; r: BomResuelto } | { ok: false; e: unknown };

@Component({
  selector: 'app-configurador',
  standalone: true,
  imports: [BuscadorSelectComponent, BomArbolComponent],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Configurador de BOM</div></div>

      <div class="cfg">
        <!-- IZQUIERDA: selección -->
        <div class="card"><div class="card-body">
          <div class="panel-title">Selección</div>

          <label class="label">Referencia</label>
          <app-buscador-select [items]="referencias()" [etiqueta]="etiquetaRef" [sub]="subRef"
            placeholder="Buscar referencia…" (seleccionar)="elegirReferencia($event)" />

          @if (config(); as c) {
            <label class="label" style="margin-top:var(--sp-4)">Marca</label>
            <select class="input" (change)="elegirMarca($event)">
              <option [value]="''">— sin marca —</option>
              @for (m of c.marcas; track m.id) { <option [value]="m.id">{{ m.nombre }}</option> }
            </select>

            @for (e of c.ejes; track e.grupo.id) {
              <label class="label" style="margin-top:var(--sp-4)">
                {{ e.grupo.nombre }} @if (e.grupo.obligatorio) { <span style="color:var(--accent)">*</span> }
              </label>
              <select class="input" (change)="setOpcionEvent(e.grupo.id, $event)">
                <option [value]="''">— elegir —</option>
                @for (o of e.opciones; track o.id) { <option [value]="o.id">{{ o.nombre }}</option> }
              </select>
            }

            <label class="label" style="margin-top:var(--sp-4)">Talla</label>
            <select class="input" (change)="elegirTalla($event)">
              @for (t of tallas(); track t) { <option [value]="t" [selected]="t === tallaSel()">{{ t }}</option> }
            </select>
          }
        </div></div>

        <!-- DERECHA: BOM en vivo -->
        <div class="card"><div class="card-body">
          <div class="panel-title">BOM resuelto @if (tallaSel(); as t) { <span class="cell-sub">· talla {{ t }}</span> }</div>

          @if (!config()) {
            <p class="cell-sub">Elegí una referencia para empezar.</p>
          } @else if (faltantes().length) {
            <p class="cell-sub">Elegí: {{ faltantes().join(', ') }}</p>
          } @else if (cargando()) {
            <p class="cell-sub">Resolviendo…</p>
          } @else if (error()) {
            <p style="color:var(--error);font-size:var(--text-sm)">{{ error() }}</p>
          } @else {
            @if (resultado(); as r) {
              @if (!r.arbol.length) {
                <p class="cell-sub">Sin BOM cargado para esta selección.</p>
              } @else {
                <app-bom-arbol [nodos]="r.arbol" />
                <div class="panel-title" style="margin-top:var(--sp-5)">Materiales comprados ({{ r.comprados.length }})</div>
                <table class="tbl"><tbody>
                  @for (c of r.comprados; track c.materialId) {
                    <tr><td>{{ c.nombre }}</td><td class="num">{{ c.consumo }} {{ c.unidad }}</td></tr>
                  }
                </tbody></table>
              }
            }
          }
        </div></div>
      </div>
    </div>
  `,
  styles: [`
    .cfg{display:grid;grid-template-columns:320px 1fr;gap:var(--sp-5);align-items:start}
    .panel-title{font-size:var(--text-h3);font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .tbl{width:100%;border-collapse:collapse}
    .tbl td{padding:var(--sp-2) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .tbl .num{text-align:right;font-family:var(--font-mono);color:var(--text-subtle)}
    @media (max-width:860px){.cfg{grid-template-columns:1fr}}
  `],
})
export class ConfiguradorComponent implements OnInit {
  private readonly api = inject(CatalogoApi);
  private readonly destroyRef = inject(DestroyRef);

  referencias = signal<ReferenciaListItem[]>([]);
  refSel = signal<ReferenciaListItem | null>(null);
  config = signal<ReferenciaConfig | null>(null);
  marcaSel = signal<MarcaOpt | null>(null);
  opcionesSel = signal<Map<number, number | null>>(new Map());
  tallaSel = signal<number | null>(null);
  resultado = signal<BomResuelto | null>(null);
  cargando = signal(false);
  error = signal('');

  tallas = computed(() => { const c = this.config(); return c ? tallasDeRef(c) : []; });
  faltantes = computed(() => { const c = this.config(); return c ? obligatoriosFaltantes(c.ejes, this.opcionesSel()) : []; });

  etiquetaRef = (r: ReferenciaListItem) => `${r.codigo} · ${r.nombreInterno}`;
  subRef = (r: ReferenciaListItem) => r.codigo;

  private readonly trigger = new Subject<ResolverParams>();
  private readonly refTrigger = new Subject<ReferenciaListItem>();

  constructor() {
    this.trigger.pipe(
      debounceTime(120),
      switchMap((p) =>
        this.api.resolver(p).pipe(
          map((r): ResolverResp => ({ ok: true, r })),
          catchError((e) => of<ResolverResp>({ ok: false, e })),
        ),
      ),
      takeUntilDestroyed(),
    ).subscribe((res) => {
      this.cargando.set(false);
      if (res.ok) { this.resultado.set(res.r); this.error.set(''); }
      else { this.resultado.set(null); this.error.set(this.msg(res.e)); }
    });

    this.refTrigger.pipe(
      switchMap((r) =>
        this.api.configReferencia(r.id).pipe(
          catchError(() => { this.error.set('No se pudo cargar la configuración'); return EMPTY; }),
        ),
      ),
      takeUntilDestroyed(),
    ).subscribe((c) => {
      this.config.set(c);
      this.tallaSel.set(c.referencia.tallaMin);
      this.recalcular();
    });
  }

  ngOnInit(): void {
    this.api.listarReferencias().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((r) => this.referencias.set(r));
  }

  elegirReferencia(r: ReferenciaListItem) {
    this.refSel.set(r);
    this.config.set(null);
    this.marcaSel.set(null);
    this.opcionesSel.set(new Map());
    this.resultado.set(null);
    this.error.set('');
    this.cargando.set(false);
    this.refTrigger.next(r);
  }

  elegirMarca(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    const m = this.config()?.marcas.find((x) => x.id === +id) ?? null;
    this.marcaSel.set(m);
    this.recalcular();
  }

  setOpcionEvent(grupoId: number, e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.setOpcion(grupoId, v === '' ? null : +v);
  }

  setOpcion(grupoId: number, opcionId: number | null) {
    this.opcionesSel.update((m) => new Map(m).set(grupoId, opcionId));
    this.recalcular();
  }

  elegirTalla(e: Event) {
    this.tallaSel.set(+(e.target as HTMLSelectElement).value);
    this.recalcular();
  }

  private recalcular() {
    const ref = this.refSel();
    const config = this.config();
    const t = this.tallaSel();
    if (!ref || !config || t == null) return;
    if (obligatoriosFaltantes(config.ejes, this.opcionesSel()).length) { this.resultado.set(null); return; }
    this.cargando.set(true);
    this.trigger.next({
      referenciaId: ref.id,
      talla: t,
      marcaId: this.marcaSel()?.id,
      opcionIds: opcionIdsSel(this.opcionesSel()),
    });
  }

  private msg(e: unknown): string {
    const m = (e as { error?: { message?: string | string[] } })?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo resolver el BOM');
  }
}
