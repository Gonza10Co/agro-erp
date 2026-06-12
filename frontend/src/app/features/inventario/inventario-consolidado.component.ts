import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InventarioApi } from '../../core/api/inventario.api';
import {
  InventarioConsolidado,
  LABEL_MOTIVO,
  MOTIVOS_MANUALES,
  MovimientoKardex,
  MotivoMovimiento,
} from '../../core/api/models/inventario.models';
import { LABEL_CELULA } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-inventario-consolidado',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Inventario consolidado</div>
        <div class="ph-actions">
          <button class="btn" (click)="cargar()">Actualizar</button>
          <button class="btn btn-primary" (click)="formAbierto.set(!formAbierto())">
            {{ formAbierto() ? 'Cerrar' : 'Movimiento de materia prima' }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="empty"><h4>No se pudo cargar el inventario</h4><p class="cell-sub">{{ error() }}</p></div>
      }

      @if (formAbierto()) {
        <div class="card form-card"><div class="card-body">
          <h4>Registrar movimiento de materia prima</h4>
          <div class="form-grid">
            <div>
              <label class="label">Material</label>
              <select class="input" [ngModel]="fMaterialId()" (ngModelChange)="fMaterialId.set($event)">
                <option [ngValue]="0" disabled>Elegí un material…</option>
                @for (m of data()?.materiales ?? []; track m.materialId) {
                  <option [ngValue]="m.materialId">{{ m.codigo }} — {{ m.nombre }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label">Tipo</label>
              <select class="input" [ngModel]="fTipo()" (ngModelChange)="cambiarTipo($event)">
                <option value="ENTRADA">Entrada</option>
                <option value="SALIDA">Salida</option>
              </select>
            </div>
            <div>
              <label class="label">Motivo</label>
              <select class="input" [ngModel]="fMotivo()" (ngModelChange)="fMotivo.set($event)">
                @for (mo of motivosDisponibles(); track mo) {
                  <option [ngValue]="mo">{{ labelMotivo[mo] }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label">Cantidad</label>
              <input class="input" type="number" min="0" step="any" [ngModel]="fCantidad()" (ngModelChange)="fCantidad.set($event)" />
            </div>
            <div>
              <label class="label">Referencia (opcional)</label>
              <input class="input" type="text" placeholder="OC-PROV-44, REQ-7…" [ngModel]="fReferencia()" (ngModelChange)="fReferencia.set($event)" />
            </div>
            <div>
              <label class="label">Observaciones (opcional)</label>
              <input class="input" type="text" placeholder="lote, calidad…" [ngModel]="fObservaciones()" (ngModelChange)="fObservaciones.set($event)" />
            </div>
          </div>
          @if (formError()) { <p class="form-error">{{ formError() }}</p> }
          <div class="form-foot">
            <button class="btn btn-primary" [disabled]="enviando() || !formValido()" (click)="registrarMovimiento()">
              {{ enviando() ? 'Registrando…' : 'Registrar movimiento' }}
            </button>
          </div>
        </div></div>
      }

      @if (!error() && data(); as d) {
        <div class="card"><div class="card-body">
          <h4>En proceso (WIP) — pares por célula</h4>
          <div class="wip-strip">
            @for (w of d.wip; track w.celula; let last = $last) {
              <div class="wip-celula" [class.has-pares]="w.pares > 0">
                <span class="wip-count">{{ w.pares }}</span>
                <span class="wip-label">{{ labelCelula[w.celula] }}</span>
              </div>
              @if (!last) { <span class="wip-arrow">→</span> }
            }
          </div>
        </div></div>

        <div class="grid-2">
          <div class="card"><div class="card-body">
            <h4>Materia prima</h4>
            @if (d.materiales.length) {
              <table class="tabla">
                <thead><tr><th>Código</th><th>Material</th><th class="num">Disponible</th><th>Unidad</th></tr></thead>
                <tbody>
                  @for (m of d.materiales; track m.materialId) {
                    <tr>
                      <td class="cell-mono">{{ m.codigo }}</td>
                      <td>{{ m.nombre }}</td>
                      <td class="num cell-mono">{{ m.cantDisponible | number:'1.0-2' }}</td>
                      <td class="cell-sub">{{ m.unidad }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="cell-sub">Sin stock de materiales registrado.</p>
            }
          </div></div>

          <div class="card"><div class="card-body">
            <h4>Producto terminado</h4>
            @if (d.pt.length) {
              <table class="tabla">
                <thead><tr><th>Producto</th><th class="num">Talla</th><th>Bodega</th><th class="num">Disponible</th><th class="num">Reservado</th></tr></thead>
                <tbody>
                  @for (p of d.pt; track p.codigo + '-' + p.talla + '-' + p.bodega) {
                    <tr>
                      <td>{{ p.producto }} <span class="cell-sub cell-mono">{{ p.codigo }}</span></td>
                      <td class="num">{{ p.talla }}</td>
                      <td>{{ p.bodega }}</td>
                      <td class="num cell-mono">{{ p.cantDisponible }}</td>
                      <td class="num cell-mono" [class.reservado]="p.cantReservada > 0">{{ p.cantReservada }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="cell-sub">Sin stock de producto terminado.</p>
            }
          </div></div>
        </div>

        <div class="card"><div class="card-body">
          <h4>Kardex — últimos movimientos</h4>
          @if (kardex().length) {
            <table class="tabla">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Ítem</th><th class="num">Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead>
              <tbody>
                @for (mv of kardex(); track mv.id) {
                  <tr>
                    <td class="cell-sub">{{ mv.createdAt | date:'dd/MM HH:mm' }}</td>
                    <td><span class="badge" [class.in]="mv.tipo === 'ENTRADA'" [class.out]="mv.tipo === 'SALIDA'">{{ mv.tipo === 'ENTRADA' ? '+ Entrada' : (mv.tipo === 'SALIDA' ? '− Salida' : 'Ajuste') }}</span></td>
                    <td>{{ labelMotivo[mv.motivo] }}</td>
                    <td>{{ itemLabel(mv) }}</td>
                    <td class="num cell-mono">{{ mv.cantidad | number:'1.0-2' }} {{ mv.material?.unidadMedida?.codigo ?? 'par' }}</td>
                    <td class="cell-mono cell-sub">{{ mv.referencia ?? '—' }}</td>
                    <td class="cell-sub">{{ mv.usuario?.username ?? 'sistema' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="cell-sub">Sin movimientos registrados todavía.</p>
          }
        </div></div>
      }
    </div>
  `,
  styles: [`
    .ph-actions{display:flex;gap:var(--sp-2)}
    .card{margin-top:var(--sp-4)}
    .card:first-of-type{margin-top:0}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-top:var(--sp-4)}
    .grid-2 .card{margin-top:0}
    @media (max-width: 1100px){.grid-2{grid-template-columns:1fr}}
    .tabla{width:100%;border-collapse:collapse}
    .tabla th,.tabla td{text-align:left;padding:var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .num{text-align:right}
    .reservado{color:var(--warning, #b8860b);font-weight:var(--fw-medium)}
    .wip-strip{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap}
    .wip-celula{display:flex;flex-direction:column;align-items:center;min-width:96px;padding:var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface)}
    .wip-celula.has-pares{border-color:var(--accent)}
    .wip-count{font-size:var(--text-xl);font-weight:var(--fw-semibold)}
    .wip-label{font-size:var(--text-sm);color:var(--text-muted)}
    .wip-arrow{color:var(--text-subtle)}
    .badge{font-size:var(--text-sm);padding:2px var(--sp-2);border-radius:var(--r-sm);border:var(--bw) solid var(--border)}
    .badge.in{color:var(--success, #1a7f37);border-color:currentColor}
    .badge.out{color:var(--danger);border-color:currentColor}
    .form-card .card-body{border-left:3px solid var(--accent)}
    .form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-3);margin-top:var(--sp-3)}
    @media (max-width: 900px){.form-grid{grid-template-columns:1fr}}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .form-error{color:var(--danger);font-size:var(--text-sm);margin-top:var(--sp-3)}
    .form-foot{margin-top:var(--sp-3);display:flex;justify-content:flex-end}
  `],
})
export class InventarioConsolidadoComponent implements OnInit {
  private readonly api = inject(InventarioApi);
  private readonly destroyRef = inject(DestroyRef);

  data = signal<InventarioConsolidado | null>(null);
  kardex = signal<MovimientoKardex[]>([]);
  error = signal<string | null>(null);

  // Form de movimiento manual de MP
  formAbierto = signal(false);
  fMaterialId = signal(0);
  fTipo = signal<'ENTRADA' | 'SALIDA'>('ENTRADA');
  fMotivo = signal<MotivoMovimiento>('COMPRA');
  fCantidad = signal(0);
  fReferencia = signal('');
  fObservaciones = signal('');
  enviando = signal(false);
  formError = signal('');

  readonly labelCelula = LABEL_CELULA;
  readonly labelMotivo = LABEL_MOTIVO;
  motivosDisponibles = computed(() => MOTIVOS_MANUALES[this.fTipo()]);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.error.set(null);
    this.api.consolidado().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => this.data.set(d),
      error: () => this.error.set('Intentá de nuevo.'),
    });
    this.api.movimientos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (k) => this.kardex.set(k),
      error: () => {},
    });
  }

  cambiarTipo(tipo: 'ENTRADA' | 'SALIDA'): void {
    this.fTipo.set(tipo);
    this.fMotivo.set(MOTIVOS_MANUALES[tipo][0]);
  }

  formValido(): boolean {
    return this.fMaterialId() > 0 && Number(this.fCantidad()) > 0;
  }

  registrarMovimiento(): void {
    if (this.enviando() || !this.formValido()) return;
    this.enviando.set(true);
    this.formError.set('');
    this.api
      .movimientoMaterial({
        materialId: this.fMaterialId(),
        tipo: this.fTipo(),
        motivo: this.fMotivo(),
        cantidad: Number(this.fCantidad()),
        referencia: this.fReferencia() || undefined,
        observaciones: this.fObservaciones() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.fCantidad.set(0);
          this.fReferencia.set('');
          this.fObservaciones.set('');
          this.cargar();
        },
        error: (e) => {
          this.enviando.set(false);
          const m = e?.error?.message;
          this.formError.set(Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo registrar el movimiento'));
        },
      });
  }

  itemLabel(mv: MovimientoKardex): string {
    if (mv.material) return `${mv.material.codigo} — ${mv.material.nombreCanonico}`;
    if (mv.inventarioPT) {
      const i = mv.inventarioPT;
      return `${i.productoConfigurado.nombreComercial} T${i.talla.valor} · ${i.bodega.nombre}`;
    }
    return '—';
  }
}
