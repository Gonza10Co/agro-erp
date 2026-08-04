import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ConsumoOf, ConsumoOfLinea } from '../../core/api/models/fabricacion.models';

/**
 * Pantalla del almacenista: qué pedía el BOM, qué se ha entregado y cuánto va de
 * diferencia. La entrega se registra acá mismo, sobre la misma tabla que se lee,
 * porque en bodega se hace de una: se mira la fila y se anota lo que salió.
 */
@Component({
  selector: 'app-of-consumo',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Entrega de materiales · OF-{{ consumo()?.consecutivo ?? '…' }}</div>
        <a class="btn btn-sm" routerLink="/fabricacion">Volver a las OF</a>
      </div>

      <div class="card"><div class="card-body">
        @if (error()) {
          <div class="empty">
            <h4>No se pudo cargar el consumo de la OF</h4>
            <p class="cell-sub">{{ error() }}</p>
          </div>
        } @else if (lineas().length) {
          <table class="tbl">
            <thead>
              <tr>
                <th>Material</th>
                <th class="num">Según el BOM</th>
                <th class="num">Entregado</th>
                <th class="num">Diferencia</th>
                <th class="num">Entregar ahora</th>
              </tr>
            </thead>
            <tbody>
              @for (l of lineas(); track l.materialId) {
                <tr>
                  <td>
                    <div class="mono">{{ l.materialCodigo }}</div>
                    <div class="cell-sub">{{ l.materialNombre }}</div>
                  </td>
                  <td class="num">{{ l.teorico | number:'1.0-4' }} <span class="cell-sub">{{ l.unidad }}</span></td>
                  <td class="num">{{ l.entregado | number:'1.0-4' }}</td>
                  <td class="num" [class.dif-alta]="l.diferencia > 0" [class.dif-baja]="l.diferencia < 0">
                    {{ l.diferencia > 0 ? '+' : '' }}{{ l.diferencia | number:'1.0-4' }}
                  </td>
                  <td class="num">
                    <input
                      class="inp-num"
                      type="number"
                      min="0"
                      step="0.0001"
                      [ngModel]="aEntregar()[l.materialId] ?? null"
                      (ngModelChange)="setCantidad(l.materialId, $event)"
                      [disabled]="guardando()"
                      [attr.aria-label]="'Cantidad a entregar de ' + l.materialNombre" />
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <div class="acciones">
            <input
              class="inp-obs"
              type="text"
              placeholder="Observación (opcional): a quién se le entregó, turno…"
              [(ngModel)]="observaciones"
              [disabled]="guardando()"
              aria-label="Observaciones de la entrega" />
            <button
              class="btn btn-primary"
              type="button"
              [disabled]="!hayQueEntregar() || guardando()"
              (click)="registrar()">
              {{ guardando() ? 'Registrando…' : 'Registrar entrega' }}
            </button>
          </div>
          @if (errorEnvio()) { <p class="msg-error">{{ errorEnvio() }}</p> }
          @if (ok()) { <p class="msg-ok">Entrega registrada. La bodega ya quedó descontada.</p> }
        } @else {
          <div class="empty">
            <h4>Esta OF todavía no pide materiales</h4>
            <p class="cell-sub">Sin pares o sin BOM resuelto no hay nada que entregar.</p>
          </div>
        }
      </div></div>
    </div>
  `,
  styles: [`
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding:0 0 var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .tbl td{padding:var(--sp-3) var(--sp-3) var(--sp-3) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm);vertical-align:top}
    .mono{font-family:var(--font-mono)}
    .num{text-align:right}
    th.num{text-align:right}
    .dif-alta{color:var(--danger);font-weight:var(--fw-medium)}
    .dif-baja{color:var(--text-subtle)}
    .inp-num{width:9ch;text-align:right;padding:var(--sp-1) var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:var(--text-sm)}
    .inp-obs{flex:1;padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-sm)}
    .acciones{display:flex;gap:var(--sp-3);align-items:center;margin-top:var(--sp-4)}
    .msg-error{color:var(--danger);font-size:var(--text-sm);margin-top:var(--sp-3)}
    .msg-ok{color:var(--text-subtle);font-size:var(--text-sm);margin-top:var(--sp-3)}
  `],
})
export class OfConsumoComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  consumo = signal<ConsumoOf | null>(null);
  error = signal<string | null>(null);
  errorEnvio = signal<string | null>(null);
  ok = signal(false);
  guardando = signal(false);
  observaciones = '';
  /** Lo tecleado en la columna "Entregar ahora", por materialId. */
  aEntregar = signal<Record<number, number | null>>({});

  lineas = computed<ConsumoOfLinea[]>(() => this.consumo()?.lineas ?? []);
  hayQueEntregar = computed(() =>
    Object.values(this.aEntregar()).some((c) => c != null && c > 0),
  );

  private get ofId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  ngOnInit(): void {
    this.cargar();
  }

  private cargar(): void {
    this.api.consumoDeOf(this.ofId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (c) => this.consumo.set(c),
      error: () => this.error.set('No se pudo cargar el consumo de la OF. Intenta de nuevo.'),
    });
  }

  setCantidad(materialId: number, valor: number | null): void {
    this.aEntregar.update((m) => ({ ...m, [materialId]: valor }));
    this.ok.set(false);
  }

  registrar(): void {
    if (this.guardando() || !this.hayQueEntregar()) return;
    const lineas = Object.entries(this.aEntregar())
      .filter(([, cant]) => cant != null && cant > 0)
      .map(([materialId, cant]) => ({ materialId: Number(materialId), cantidad: cant as number }));

    this.guardando.set(true);
    this.errorEnvio.set(null);
    this.ok.set(false);
    this.api
      .registrarConsumo(this.ofId, lineas, this.observaciones.trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          // El backend devuelve la tabla ya recalculada: se pinta esa, no una
          // versión optimista que podría discrepar de la bodega real.
          this.consumo.set(c);
          this.aEntregar.set({});
          this.observaciones = '';
          this.guardando.set(false);
          this.ok.set(true);
        },
        error: (e) => {
          this.guardando.set(false);
          this.errorEnvio.set(
            e?.error?.message ??
              'No se pudo registrar la entrega. Revisa las cantidades e intenta de nuevo.',
          );
        },
      });
  }
}
