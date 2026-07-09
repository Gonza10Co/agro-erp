import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CatalogoApi } from '../../../core/api/catalogo.api';
import {
  BomVersionData, CrearBomVersionPayload, MaterialItem, ReferenciaConfig,
} from '../../../core/api/models/catalogo.models';
import { Talla } from '../../../core/api/models/pedidos.models';
import { PiezasApi, Pieza } from '../../../core/api/piezas.api';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { lineaDuplicada, mensajeDuplicado } from './bom-editor.util';

interface LineaEdit {
  materialId: number | null;
  /** Pieza del despiece; null = el material va a la bota completa. */
  piezaId: number | null;
  claseConsumo: 'CURVA' | 'FIJO';
  consumoFijo: number | null;
  mermaPct: number | null;
  tallas: Record<number, number>; // tallaId -> consumo
}

const nuevaLinea = (): LineaEdit => ({
  materialId: null, piezaId: null, claseConsumo: 'FIJO', consumoFijo: null, mermaPct: null, tallas: {},
});

@Component({
  selector: 'app-bom-editor',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <a class="cell-sub link" (click)="volver()">← Volver</a>
          <div class="ph-title">Editor de BOM @if (ref(); as r) { · {{ r.codigo }} {{ r.nombreInterno }} }</div>
        </div>
      </div>

      <div class="ed">
        <!-- IZQUIERDA: líneas del BOM -->
        <div class="card"><div class="card-body">
          <div class="panel-title">Líneas del BOM</div>
          @if (lineas().length === 0) {
            <p class="cell-sub">Sin líneas. Agrega la primera.</p>
          } @else {
            <table class="tbl">
              <thead><tr><th>Material</th><th>Pieza</th><th>Clase</th><th class="num">Consumo</th><th></th></tr></thead>
              <tbody>
                @for (l of lineas(); track $index) {
                  <tr>
                    <td>{{ nombreMaterial(l.materialId) }}</td>
                    <td class="cell-sub">{{ nombrePieza(l.piezaId) ?? 'Bota completa' }}</td>
                    <td><span class="badge">{{ l.claseConsumo }}</span></td>
                    <td class="num">{{ resumen(l) }}</td>
                    <td class="acc">
                      <button class="icon-btn" type="button" title="Editar" (click)="editar($index)">✎</button>
                      <button class="icon-btn" type="button" title="Quitar" (click)="quitar($index)">✕</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
          <button class="btn btn-ghost" type="button" (click)="abrirNueva()" style="margin-top:var(--sp-4)">+ Agregar línea</button>
        </div></div>

        <!-- DERECHA: preview + guardar -->
        <div class="card"><div class="card-body">
          <div class="panel-title">Vista previa</div>
          @if (lineas().length === 0) {
            <p class="cell-sub">El BOM quedará vacío.</p>
          } @else {
            <ul class="prev">
              @for (l of lineas(); track $index) {
                <li><span>{{ nombreMaterial(l.materialId) }}</span><span class="num">{{ resumen(l) }}</span></li>
              }
            </ul>
          }
          @if (error()) { <p class="msg-err">{{ error() }}</p> }
          @if (okMsg()) { <p class="msg-ok">{{ okMsg() }}</p> }
          @if (confirmando()) {
            <div class="confirm">
              <p class="cell-sub">Se creará una nueva versión y se desactivará la v{{ versionActiva() }} vigente. ¿Continuar?</p>
              <div class="confirm-acc">
                <button class="btn btn-ghost" type="button" [disabled]="guardando()" (click)="cancelarGuardar()">Cancelar</button>
                <button class="btn btn-primary" type="button" [disabled]="guardando()" (click)="guardar()">
                  {{ guardando() ? 'Guardando…' : 'Sí, guardar' }}
                </button>
              </div>
            </div>
          } @else {
            <button class="btn btn-primary btn-block" type="button" [disabled]="guardando()" (click)="onGuardarClick()"
              style="margin-top:var(--sp-4)">
              {{ guardando() ? 'Guardando…' : 'Guardar nueva versión' }}
            </button>
          }
          @if (versionActiva(); as v) { <p class="cell-sub" style="margin-top:var(--sp-2)">Versión activa actual: v{{ v }}</p> }
        </div></div>
      </div>
    </div>

    <!-- DRAWER: editar una línea -->
    <app-drawer [open]="drawerAbierto()" [title]="editIdx() === null ? 'Nueva línea' : 'Editar línea'" (closed)="cerrarDrawer()">
      <div class="field">
        <label class="label">Material</label>
        <select class="input" [ngModel]="borrador().materialId" (ngModelChange)="setBorrador('materialId', $event)">
          <option [ngValue]="null">— elegir —</option>
          @for (m of materiales(); track m.id) {
            <option [ngValue]="m.id">{{ m.nombreCanonico }} ({{ m.unidad }})</option>
          }
        </select>
      </div>
      <div class="field">
        <label class="label">Pieza</label>
        <select class="input" [ngModel]="borrador().piezaId" (ngModelChange)="setBorrador('piezaId', $event)">
          <option [ngValue]="null">Bota completa (sin despiezar)</option>
          @for (p of piezas(); track p.id) {
            <option [ngValue]="p.id">{{ p.nombre }}</option>
          }
        </select>
        <small class="hint">El mismo material puede ir en varias piezas con consumos distintos.</small>
      </div>
      <div class="field">
        <label class="label">Clase de consumo</label>
        <select class="input" [ngModel]="borrador().claseConsumo" (ngModelChange)="setClase($event)">
          <option value="FIJO">Fijo (igual en todas las tallas)</option>
          <option value="CURVA">Curva (un valor por talla)</option>
        </select>
      </div>
      @if (borrador().claseConsumo === 'FIJO') {
        <div class="field">
          <label class="label">Consumo fijo</label>
          <input class="input" type="number" min="0" step="0.0001"
            [ngModel]="borrador().consumoFijo" (ngModelChange)="setBorrador('consumoFijo', $event)" />
        </div>
      } @else {
        <div class="field">
          <label class="label">Consumo por talla</label>
          <div class="grid">
            @for (t of tallas(); track t.id) {
              <label class="gcell">
                <span class="gtalla">{{ t.valor }}</span>
                <input type="number" min="0" step="0.0001" class="ginput"
                  [ngModel]="borrador().tallas[t.id]" (ngModelChange)="setTalla(t.id, $event)" [ngModelOptions]="{standalone:true}" />
              </label>
            }
          </div>
        </div>
      }
      <div class="field">
        <label class="label">Merma % (opcional)</label>
        <input class="input" type="number" min="0" step="0.1"
          [ngModel]="borrador().mermaPct" (ngModelChange)="setBorrador('mermaPct', $event)" />
      </div>
      @if (errorDrawer()) { <p class="msg-err">{{ errorDrawer() }}</p> }
      <button class="btn btn-primary btn-block" type="button" (click)="aplicarLinea()">Aplicar</button>
    </app-drawer>
  `,
  styles: [`
    .ed{display:grid;grid-template-columns:1fr 340px;gap:var(--sp-5);align-items:start}
    .panel-title{font-size:var(--text-h3);font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .hint{display:block;color:var(--text-muted);font-size:var(--text-xs);margin-top:var(--sp-2)}
    .field{margin-bottom:var(--sp-4)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-muted);font-weight:var(--fw-medium);padding-bottom:var(--sp-2)}
    .tbl td{padding:var(--sp-2) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .tbl .num{text-align:right;font-family:var(--font-mono);color:var(--text-subtle)}
    .tbl .acc{text-align:right;white-space:nowrap}
    .badge{font-size:var(--text-caption);padding:0 var(--sp-2);border-radius:var(--r-sm);background:var(--primary-subtle);color:var(--primary)}
    .prev{list-style:none;margin:0;padding:0}
    .prev li{display:flex;justify-content:space-between;padding:var(--sp-2) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .prev .num{font-family:var(--font-mono);color:var(--text-subtle)}
    .link{cursor:pointer;text-decoration:underline}
    .grid{display:flex;flex-wrap:wrap;gap:var(--sp-2)}
    .gcell{display:flex;flex-direction:column;align-items:center;gap:4px}
    .gtalla{font-family:var(--font-mono);font-size:var(--text-caption);color:var(--text-muted)}
    .ginput{width:64px;text-align:center;padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-family:var(--font-mono)}
    .msg-err{color:var(--error);font-size:var(--text-sm)}
    .msg-ok{color:var(--success, #2e7d32);font-size:var(--text-sm)}
    .confirm{margin-top:var(--sp-4);padding:var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface)}
    .confirm-acc{display:flex;gap:var(--sp-2);justify-content:flex-end;margin-top:var(--sp-3)}
    @media (max-width:860px){.ed{grid-template-columns:1fr}}
  `],
})
export class BomEditorComponent implements OnInit {
  private readonly api = inject(CatalogoApi);
  private readonly piezasApi = inject(PiezasApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  referenciaId = 0;
  ref = signal<ReferenciaConfig['referencia'] | null>(null);
  tallas = signal<Talla[]>([]);
  materiales = signal<MaterialItem[]>([]);
  piezas = signal<Pieza[]>([]);
  lineas = signal<LineaEdit[]>([]);
  versionActiva = signal<number | null>(null);

  drawerAbierto = signal(false);
  editIdx = signal<number | null>(null);
  borrador = signal<LineaEdit>(nuevaLinea());

  guardando = signal(false);
  error = signal('');
  okMsg = signal('');
  errorDrawer = signal('');
  confirmando = signal(false);

  private readonly matIndex = computed(() => {
    const map = new Map<number, MaterialItem>();
    for (const m of this.materiales()) map.set(m.id, m);
    return map;
  });

  ngOnInit(): void {
    this.referenciaId = Number(this.route.snapshot.paramMap.get('referenciaId'));
    forkJoin({
      config: this.api.configReferencia(this.referenciaId),
      tallas: this.api.listarTallas(),
      materiales: this.api.listarMateriales(),
      versiones: this.api.versionesBom(this.referenciaId),
      piezas: this.piezasApi.listar(),
    }).subscribe({
      next: ({ config, tallas, materiales, versiones, piezas }) => {
        this.ref.set(config.referencia);
        const min = config.referencia.tallaMin, max = config.referencia.tallaMax;
        this.tallas.set(tallas.filter((t) => t.valor >= min && t.valor <= max));
        this.materiales.set(materiales);
        this.piezas.set(piezas);
        const activa = versiones.find((v) => v.activo);
        this.versionActiva.set(activa?.version ?? null);
        if (activa) this.lineas.set(activa.lineas.map(mapLinea));
      },
      error: () => this.error.set('No se pudo cargar el BOM'),
    });
  }

  nombreMaterial(id: number | null): string {
    if (id == null) return '(sin material)';
    return this.matIndex().get(id)?.nombreCanonico ?? `#${id}`;
  }

  nombrePieza(id: number | null): string | null {
    if (id == null) return null;
    return this.piezas().find((p) => p.id === id)?.nombre ?? `#${id}`;
  }

  resumen(l: LineaEdit): string {
    const u = l.materialId != null ? (this.matIndex().get(l.materialId)?.unidad ?? '') : '';
    const base = l.claseConsumo === 'FIJO'
      ? `${l.consumoFijo ?? 0} ${u}`
      : `curva (${Object.keys(l.tallas).length} tallas)`;
    return l.mermaPct ? `${base} · +${l.mermaPct}% merma` : base;
  }

  abrirNueva(): void {
    this.editIdx.set(null);
    this.borrador.set(nuevaLinea());
    this.errorDrawer.set('');
    this.drawerAbierto.set(true);
  }

  editar(idx: number): void {
    this.editIdx.set(idx);
    this.borrador.set(clonar(this.lineas()[idx]));
    this.errorDrawer.set('');
    this.drawerAbierto.set(true);
  }

  quitar(idx: number): void {
    this.okMsg.set('');
    this.lineas.update((ls) => ls.filter((_, i) => i !== idx));
  }

  cerrarDrawer(): void { this.drawerAbierto.set(false); }

  setBorrador(campo: 'materialId' | 'piezaId' | 'consumoFijo' | 'mermaPct', valor: unknown): void {
    const v = valor === '' || valor == null ? null : Number(valor);
    this.borrador.update((b) => ({ ...b, [campo]: v }));
  }

  setClase(clase: 'CURVA' | 'FIJO'): void {
    this.borrador.update((b) => ({ ...b, claseConsumo: clase }));
  }

  setTalla(tallaId: number, valor: unknown): void {
    const v = Math.max(0, Number(valor) || 0);
    this.borrador.update((b) => ({ ...b, tallas: { ...b.tallas, [tallaId]: v } }));
  }

  aplicarLinea(): void {
    const b = this.borrador();
    if (b.materialId == null) { this.errorDrawer.set('Elige un material'); return; }
    if (b.claseConsumo === 'FIJO' && (b.consumoFijo == null || b.consumoFijo <= 0)) {
      this.errorDrawer.set('El consumo fijo debe ser mayor a 0'); return;
    }
    if (b.claseConsumo === 'CURVA' && !Object.values(b.tallas).some((c) => c > 0)) {
      this.errorDrawer.set('Carga al menos una talla con consumo'); return;
    }
    const idx = this.editIdx();
    // Se admite el mismo material en piezas distintas; lo que no se repite es (material, pieza).
    if (lineaDuplicada(this.lineas(), b, idx)) {
      this.errorDrawer.set(mensajeDuplicado(this.nombrePieza(b.piezaId))); return;
    }
    this.okMsg.set('');
    this.lineas.update((ls) => {
      const copia = [...ls];
      if (idx === null) copia.push(b); else copia[idx] = b;
      return copia;
    });
    this.drawerAbierto.set(false);
  }

  // Clic en el botón principal: si hay una versión vigente que se desactivará,
  // pide confirmación (la creación de versión es irreversible). Si no, guarda directo.
  onGuardarClick(): void {
    if (this.guardando()) return;
    if (this.lineas().length === 0) { this.error.set('El BOM necesita al menos una línea'); return; }
    if (this.versionActiva() != null && !this.confirmando()) { this.error.set(''); this.confirmando.set(true); return; }
    this.guardar();
  }

  cancelarGuardar(): void { this.confirmando.set(false); }

  guardar(): void {
    if (this.guardando()) return;
    if (this.lineas().length === 0) { this.error.set('El BOM necesita al menos una línea'); return; }
    this.confirmando.set(false);
    this.error.set(''); this.okMsg.set(''); this.guardando.set(true);
    const payload: CrearBomVersionPayload = {
      referenciaId: this.referenciaId,
      lineas: this.lineas().map((l) => {
        const base = {
          materialId: l.materialId!,
          piezaId: l.piezaId ?? undefined,
          claseConsumo: l.claseConsumo,
          mermaPct: l.mermaPct ?? undefined,
        };
        if (l.claseConsumo === 'FIJO') return { ...base, consumoFijo: l.consumoFijo ?? 0 };
        const tallas = Object.entries(l.tallas)
          .filter(([, c]) => c > 0)
          .map(([tallaId, consumo]) => ({ tallaId: Number(tallaId), consumo }));
        return { ...base, tallas };
      }),
    };
    this.api.crearVersionBom(payload).subscribe({
      next: (v) => { this.guardando.set(false); this.versionActiva.set(v.version); this.okMsg.set(`Versión v${v.version} guardada`); },
      error: (e) => { this.guardando.set(false); this.error.set(e?.error?.message ?? 'No se pudo guardar la versión'); },
    });
  }

  volver(): void { this.router.navigate(['/catalog/configurador']); }
}

function mapLinea(l: BomVersionData['lineas'][number]): LineaEdit {
  const tallas: Record<number, number> = {};
  for (const t of l.lineasTalla) tallas[t.tallaId] = Number(t.consumo);
  return {
    materialId: l.materialId,
    piezaId: l.piezaId ?? null,
    claseConsumo: l.claseConsumo,
    consumoFijo: l.consumoFijo == null ? null : Number(l.consumoFijo),
    mermaPct: l.mermaPct == null ? null : Number(l.mermaPct),
    tallas,
  };
}

function clonar(l: LineaEdit): LineaEdit {
  return { ...l, tallas: { ...l.tallas } };
}
