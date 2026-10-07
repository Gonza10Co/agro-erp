import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CorteApi } from '../../core/api/corte.api';
import { CrearOrdenCorteDto, OfDisponible } from '../../core/api/models/corte.models';
import { LineasApi, Linea } from '../../core/api/lineas.api';

/** Un renglón de la orden: producto × talla, con la OF que lo alimenta. */
export interface RenglonForm {
  ofId: number;
  ofConsecutivo: number;
  productoConfiguradoId: number;
  producto: string;
  tallaId: number;
  talla: number;
  /** Lo que faltaba programar de esa OF al cargarla: referencia para el jefe de corte. */
  pendiente: number;
  cantProgramada: number | null;
}

/** La jornada de hoy en la hora de la planta (no en UTC: a las 7 pm ya sería mañana). */
export function hoyLocal(ahora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

/** Texto de la OF en el selector: lo que el jefe de corte reconoce del pedido. */
export function etiquetaOf(of: OfDisponible): string {
  const productos = [...new Set(of.renglones.map((r) => r.producto.nombre))].join(', ');
  const pares =
    of.pendiente === of.aProducir
      ? `${of.aProducir} pares`
      : `${of.pendiente} de ${of.aProducir} pares por programar`;
  return `OF-${of.consecutivo} · OC #${of.oc.consecutivo} ${of.oc.cliente} · ${productos} · ${pares}`;
}

/**
 * Carga los renglones pendientes de una OF sobre los que ya tiene la orden. Una
 * orden no admite el mismo producto × talla dos veces (lo exige la base), así que
 * si dos OF piden lo mismo, el de la segunda se deja por fuera y se avisa: ese va
 * en otra orden del día.
 */
export function agregarRenglonesDeOf(
  actuales: RenglonForm[],
  of: OfDisponible,
): { renglones: RenglonForm[]; repetidos: string[] } {
  const ocupados = new Set(actuales.map((r) => `${r.productoConfiguradoId}-${r.tallaId}`));
  const repetidos: string[] = [];
  const nuevos: RenglonForm[] = [];
  for (const r of of.renglones) {
    if (r.pendiente <= 0) continue;
    if (ocupados.has(`${r.productoConfiguradoId}-${r.tallaId}`)) {
      repetidos.push(`${r.producto.nombre} talla ${r.talla}`);
      continue;
    }
    nuevos.push({
      ofId: of.id,
      ofConsecutivo: of.consecutivo,
      productoConfiguradoId: r.productoConfiguradoId,
      producto: r.producto.nombre,
      tallaId: r.tallaId,
      talla: r.talla,
      pendiente: r.pendiente,
      cantProgramada: r.pendiente,
    });
  }
  return { renglones: [...actuales, ...nuevos], repetidos };
}

// Nueva orden de corte (2026-10-05): el jefe de corte arma la orden del día con el
// número de la canasta y la carga desde las OF abiertas. Al guardar va al detalle,
// donde ya se registra el avance.
@Component({
  selector: 'app-corte-orden-crear',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <a class="breadcrumb" routerLink="/corte">← Control de corte</a>
          <div class="ph-title">Nueva orden de corte</div>
          <div class="t-sm t-muted">
            La orden del día, con el número que va escrito en la canasta. Puede juntar varios pedidos.
          </div>
        </div>
      </div>

      <div class="card"><div class="card-body">
        <div class="cabecera">
          <div class="field">
            <label class="label" for="oc-codigo">Código de la canasta</label>
            <input id="oc-codigo" class="input mono" type="text" maxlength="30" placeholder="AGR-905"
              [ngModel]="codigo()" (ngModelChange)="codigo.set($event)" />
          </div>
          <div class="field">
            <label class="label" for="oc-fecha">Fecha</label>
            <input id="oc-fecha" class="input" type="date"
              [ngModel]="fecha()" (ngModelChange)="fecha.set($event)" />
          </div>
          <div class="field">
            <label class="label" for="oc-linea">Línea</label>
            <select id="oc-linea" class="input" [ngModel]="lineaId()" (ngModelChange)="lineaId.set($event)">
              <option [ngValue]="null">Elegir línea</option>
              @for (l of lineas(); track l.id) {
                <option [ngValue]="l.id">{{ l.nombre }}</option>
              }
            </select>
          </div>
        </div>

        <h3 class="sec">Cargar desde una OF</h3>
        <div class="cargar-of">
          <select id="oc-of" class="input" [ngModel]="ofId()" (ngModelChange)="ofId.set($event)">
            <option [ngValue]="null">
              {{ ofs().length ? 'Elegir OF abierta' : 'No hay OF abiertas' }}
            </option>
            @for (of of ofs(); track of.id) {
              <option [ngValue]="of.id" [disabled]="of.pendiente === 0 || yaCargada(of.id)">
                {{ etiqueta(of) }}{{ of.pendiente === 0 ? ' (ya programada)' : '' }}
              </option>
            }
          </select>
          <button class="btn" type="button" [disabled]="ofId() === null" (click)="agregarOf()">
            + Agregar OF
          </button>
        </div>
        @if (aviso()) { <p class="aviso t-sm">{{ aviso() }}</p> }

        @if (renglones().length) {
          <div class="table-wrap">
            <div class="table-scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>OF</th>
                    <th>Producto</th>
                    <th class="num">Talla</th>
                    <th class="num">Pendiente</th>
                    <th class="num">A cortar</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of renglones(); track r.ofId + '-' + r.productoConfiguradoId + '-' + r.tallaId; let i = $index) {
                    <tr>
                      <td class="mono">OF-{{ r.ofConsecutivo }}</td>
                      <td class="t-sm">{{ r.producto }}</td>
                      <td class="num">{{ r.talla }}</td>
                      <td class="num t-muted">{{ r.pendiente | number }}</td>
                      <td class="num">
                        <input class="input num cant" type="number" min="1" step="1"
                          [attr.aria-label]="'Pares a cortar talla ' + r.talla"
                          [ngModel]="r.cantProgramada" (ngModelChange)="setCantidad(i, $event)" />
                      </td>
                      <td>
                        <button class="btn btn-ghost btn-x" type="button" title="Quitar renglón"
                          (click)="quitarRenglon(i)">✕</button>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="total">
                    <td colspan="4">Total de la orden</td>
                    <td class="num">{{ totalPares() | number }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        } @else {
          <div class="empty">
            <h4>La orden todavía no tiene renglones</h4>
            <p class="cell-sub">Escoge una OF abierta y se cargan sus tallas con lo que falta por cortar.</p>
          </div>
        }

        <label class="label" for="oc-obs" style="margin-top:var(--sp-4)">Observaciones (opcional)</label>
        <input id="oc-obs" class="input" type="text" maxlength="500" placeholder="turno, material, novedad…"
          [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" />

        @if (error()) { <p class="error">{{ error() }}</p> }
        @if (!valido() && motivoInvalido()) { <p class="t-sm t-muted">{{ motivoInvalido() }}</p> }

        <div style="margin-top:var(--sp-5)">
          <button class="btn btn-primary" type="button" [class.is-loading]="enviando()"
            [disabled]="enviando() || !valido()" (click)="crear()">Crear orden de corte</button>
        </div>
      </div></div>
    </div>
  `,
  styles: [`
    .breadcrumb{display:inline-block;margin-bottom:6px;font-size:.85rem}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .input.num{text-align:right;font-family:var(--font-mono)}
    .input.cant{max-width:110px;margin-left:auto}
    .cabecera{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--sp-4)}
    .sec{margin:var(--sp-5) 0 var(--sp-3);font-size:1.05rem}
    .cargar-of{display:grid;grid-template-columns:1fr auto;gap:var(--sp-2);margin-bottom:var(--sp-4)}
    .aviso{padding:var(--sp-2) var(--sp-3);border-left:3px solid var(--warning, var(--accent));background:var(--surface)}
    .error{color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)}
    .btn-x{padding:var(--sp-1) var(--sp-2)}
    tfoot .total td{font-weight:600;border-top:2px solid var(--border-strong)}
    @media (max-width:600px){.cargar-of{grid-template-columns:1fr}}
  `],
})
export class CorteOrdenCrearComponent implements OnInit {
  private readonly api = inject(CorteApi);
  private readonly lineasApi = inject(LineasApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly lineas = signal<Linea[]>([]);
  readonly ofs = signal<OfDisponible[]>([]);

  readonly codigo = signal('');
  readonly fecha = signal(hoyLocal());
  readonly lineaId = signal<number | null>(null);
  readonly observaciones = signal('');
  readonly ofId = signal<number | null>(null);
  readonly renglones = signal<RenglonForm[]>([]);

  readonly aviso = signal('');
  readonly error = signal('');
  readonly enviando = signal(false);

  readonly totalPares = computed(() =>
    this.renglones().reduce((a, r) => a + (Number(r.cantProgramada) || 0), 0),
  );

  /** Por qué todavía no se puede guardar; vacío cuando todo está en orden. */
  readonly motivoInvalido = computed(() => {
    if (!this.codigo().trim()) return 'Falta el código de la canasta.';
    if (!this.fecha()) return 'Falta la fecha.';
    if (this.lineaId() == null) return 'Falta la línea.';
    if (!this.renglones().length) return 'Agrega al menos una OF con tallas por cortar.';
    const mala = this.renglones().find((r) => {
      const n = Number(r.cantProgramada);
      return !Number.isInteger(n) || n <= 0;
    });
    if (mala) return `La cantidad de la talla ${mala.talla} debe ser un número entero mayor que cero.`;
    return '';
  });

  readonly valido = computed(() => this.motivoInvalido() === '');

  ngOnInit(): void {
    this.lineasApi.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (ls) => this.lineas.set(ls.filter((l) => l.activo)),
      error: () => this.lineas.set([]),
    });
    this.api.ofsDisponibles().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (ofs) => this.ofs.set(ofs),
      error: (e) => this.error.set(e?.error?.message ?? 'No se pudieron cargar las OF abiertas'),
    });
  }

  etiqueta(of: OfDisponible): string {
    return etiquetaOf(of);
  }

  yaCargada(ofId: number): boolean {
    return this.renglones().some((r) => r.ofId === ofId);
  }

  agregarOf(): void {
    const of = this.ofs().find((o) => o.id === this.ofId());
    if (!of) return;
    const avisos: string[] = [];
    const { renglones, repetidos } = agregarRenglonesDeOf(this.renglones(), of);
    if (renglones.length === this.renglones().length && !repetidos.length) {
      avisos.push(`La OF-${of.consecutivo} ya no tiene tallas por programar.`);
    }
    if (repetidos.length) {
      avisos.push(
        `De la OF-${of.consecutivo} quedaron por fuera ${repetidos.join(', ')}: ya están en la orden por otra OF. Van en otra orden del día.`,
      );
    }
    // La línea sale del pedido; si ya había otra escogida, se respeta pero se avisa.
    if (of.linea) {
      if (this.lineaId() == null) this.lineaId.set(of.linea.id);
      else if (this.lineaId() !== of.linea.id) {
        avisos.push(`Ojo: la OF-${of.consecutivo} es de la línea ${of.linea.nombre}.`);
      }
    }
    this.renglones.set(renglones);
    this.aviso.set(avisos.join(' '));
    this.ofId.set(null);
  }

  setCantidad(i: number, valor: number | string | null): void {
    const cant = valor === '' || valor == null ? null : Number(valor);
    this.renglones.update((rs) => rs.map((r, idx) => (idx === i ? { ...r, cantProgramada: cant } : r)));
  }

  quitarRenglon(i: number): void {
    this.renglones.update((rs) => rs.filter((_, idx) => idx !== i));
  }

  crear(): void {
    if (this.enviando() || !this.valido()) return;
    this.enviando.set(true);
    this.error.set('');
    const obs = this.observaciones().trim();
    const dto: CrearOrdenCorteDto = {
      codigo: this.codigo().trim().toUpperCase(),
      fecha: this.fecha(),
      lineaId: this.lineaId()!,
      ...(obs ? { observaciones: obs } : {}),
      lineas: this.renglones().map((r) => ({
        productoConfiguradoId: r.productoConfiguradoId,
        tallaId: r.tallaId,
        cantProgramada: Number(r.cantProgramada),
        ofId: r.ofId,
      })),
    };
    this.api.crear(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => this.router.navigate(['/corte/ordenes', o.id]),
      error: (e) => {
        this.enviando.set(false);
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo crear la orden de corte'));
      },
    });
  }
}
